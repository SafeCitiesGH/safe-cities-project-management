import { eq, and, inArray } from 'drizzle-orm'
import { db } from '~/server/db'
import {
    files,
    filePermissions,
    users,
    type SharePermission,
} from '~/server/db/schema'

// Permission hierarchy: edit > comment > view
const PERMISSION_HIERARCHY = {
    view: 1,
    comment: 2,
    edit: 3,
} as const

/**
 * Single optimized function to get user context and all their permissions at once
 * This reduces multiple database calls to just 2 queries for most pages
 */
export async function getUserPermissionContext(userId: string) {
    // Single query to get user info and all their permissions
    const [userInfo, userPermissions] = await Promise.all([
        db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { role: true, name: true, email: true },
        }),
        db.query.filePermissions.findMany({
            where: eq(filePermissions.userId, userId),
            columns: { fileId: true, permission: true },
        }),
    ])

    if (!userInfo) {
        return { isAdmin: false, permissions: new Map() }
    }

    // If admin, they have edit permission on everything
    if (userInfo.role === 'admin') {
        return {
            isAdmin: true,
            permissions: new Map(),
            userInfo,
        }
    }

    // Build permission map for quick lookups
    const permissionMap = new Map<number, SharePermission>()
    userPermissions.forEach((perm) => {
        const current = permissionMap.get(perm.fileId)
        // Keep highest permission if multiple exist for same file
        if (
            !current ||
            PERMISSION_HIERARCHY[perm.permission] >
                PERMISSION_HIERARCHY[current]
        ) {
            permissionMap.set(perm.fileId, perm.permission)
        }
    })

    return {
        isAdmin: false,
        permissions: permissionMap,
        userInfo,
    }
}

/**
 * Check if user has specific permission on a file (including inherited permissions)
 * Uses the permission context to avoid additional database calls
 */
export function hasPermissionInContext(
    context: Awaited<ReturnType<typeof getUserPermissionContext>>,
    fileId: number,
    requiredPermission: SharePermission,
    fileAncestors?: number[]
): boolean {
    if (context.isAdmin) return true

    const required = PERMISSION_HIERARCHY[requiredPermission]

    // Check direct permission on file
    const directPermission = context.permissions.get(fileId)
    if (
        directPermission &&
        PERMISSION_HIERARCHY[directPermission] >= required
    ) {
        return true
    }

    // Check inherited permissions from ancestors if provided
    if (fileAncestors) {
        for (const ancestorId of fileAncestors) {
            const ancestorPermission = context.permissions.get(ancestorId)
            if (
                ancestorPermission &&
                PERMISSION_HIERARCHY[ancestorPermission] >= required
            ) {
                return true
            }
        }
    }

    return false
}

/**
 * Get all files user has access to (for file tree filtering)
 * This is optimized to work with the permission context
 */
export async function getAccessibleFiles(
    context: Awaited<ReturnType<typeof getUserPermissionContext>>,
    allFiles: Array<{ id: number; parentId: number | null; type?: string }>
): Promise<Set<number>> {
    const accessibleFileIds = new Set<number>()

    if (context.isAdmin) {
        // Admins can see all files
        allFiles.forEach((file) => accessibleFileIds.add(file.id))
        return accessibleFileIds
    }

    // Add files with direct permissions
    context.permissions.forEach((_, fileId) => {
        accessibleFileIds.add(fileId)
    })

    // Add all descendants of files with permissions
    const addDescendants = (parentId: number) => {
        allFiles
            .filter((file) => file.parentId === parentId)
            .forEach((child) => {
                accessibleFileIds.add(child.id)
                addDescendants(child.id)
            })
    }

    context.permissions.forEach((_, fileId) => {
        addDescendants(fileId)
    })

    // Add ancestor folders so users can see the path
    const filesToCheck = Array.from(accessibleFileIds)
    for (const fileId of filesToCheck) {
        const file = allFiles.find((f) => f.id === fileId)
        if (file?.parentId) {
            let currentParentId: number | null = file.parentId
            while (currentParentId) {
                accessibleFileIds.add(currentParentId)
                const parent = allFiles.find((f) => f.id === currentParentId)
                currentParentId = parent?.parentId ?? null
            }
        }
    }

    // Add programs that have accessible descendants
    const programs = allFiles.filter(f => f.type === 'programme')
    for (const program of programs) {
        const hasAccessibleDescendant = Array.from(accessibleFileIds).some(fileId => {
            const file = allFiles.find(f => f.id === fileId)
            if (!file) return false
            
            let currentParentId = file.parentId
            while (currentParentId) {
                if (currentParentId === program.id) return true
                const parent = allFiles.find(f => f.id === currentParentId)
                currentParentId = parent?.parentId ?? null
            }
            return false
        })
        
        if (hasAccessibleDescendant) {
            accessibleFileIds.add(program.id)
        }
    }

    return accessibleFileIds
}

/**
 * Get users with access to a file (for notifications)
 * Single query instead of multiple permission checks
 */
export async function getUsersWithFileAccess(
    fileId: number
): Promise<string[]> {
    const usersWithAccess = await db.query.filePermissions.findMany({
        where: eq(filePermissions.fileId, fileId),
        columns: { userId: true },
    })

    return usersWithAccess.map((u) => u.userId)
}

/**
 * Lightweight permission check for a single file (when you don't need full context)
 */
export async function quickPermissionCheck(
    userId: string,
    fileId: number,
    requiredPermission: SharePermission
): Promise<boolean> {
    // Check if user is admin first
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
    })

    if (user?.role === 'admin') return true

    // Check direct permission on file
    const permission = await db.query.filePermissions.findFirst({
        where: and(
            eq(filePermissions.userId, userId),
            eq(filePermissions.fileId, fileId)
        ),
        columns: { permission: true },
    })

    if (!permission) return false

    return (
        PERMISSION_HIERARCHY[permission.permission] >=
        PERMISSION_HIERARCHY[requiredPermission]
    )
}

/**
 * Batch check permissions for multiple files (optimized)
 */
export async function batchPermissionCheck(
    userId: string,
    fileIds: number[]
): Promise<Map<number, SharePermission | null>> {
    const result = new Map<number, SharePermission | null>()

    if (fileIds.length === 0) return result

    // Check if user is admin
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
    })

    if (user?.role === 'admin') {
        // Admins have edit permission on all files
        fileIds.forEach((fileId) => result.set(fileId, 'edit'))
        return result
    }

    // Batch query permissions
    const permissions = await db.query.filePermissions.findMany({
        where: and(
            eq(filePermissions.userId, userId),
            inArray(filePermissions.fileId, fileIds)
        ),
        columns: { fileId: true, permission: true },
    })

    // Initialize all files with null permission
    fileIds.forEach((fileId) => result.set(fileId, null))

    // Set actual permissions (keep highest if multiple)
    permissions.forEach((perm) => {
        const current = result.get(perm.fileId)
        if (
            !current ||
            PERMISSION_HIERARCHY[perm.permission] >
                PERMISSION_HIERARCHY[current]
        ) {
            result.set(perm.fileId, perm.permission)
        }
    })

    return result
}
