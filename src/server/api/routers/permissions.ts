import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'
import {
    createTRPCRouter,
    protectedProcedure,
    adminProcedure,
} from '~/server/api/trpc'
import {
    filePermissions,
    permissionSchema,
    files,
    users,
    notifications,
    effectivePermissions,
    FILE_TYPES,
    type SharePermission,
} from '~/server/db/schema'
import {
    setFilePermission,
    removeFilePermission,
    getFilePermissions,
    getUserFilePermission,
    hasPermission,
} from '~/lib/permissions'
import {
    getUserPermissionContext,
    hasPermissionInContext,
    quickPermissionCheck,
    batchPermissionCheck,
} from '~/lib/permissions-simple'
import {
    getFileDescendantsFast,
    invalidatePermissionCache,
} from '~/lib/permissions-optimized'
import {
    superFastPermissionCheck,
    ultraFastBatchCheck,
    invalidateSpecificPermission,
    invalidateUserPermissions,
    asyncRebuildEffectivePermissions,
    clearAllPermissionCaches,
} from '~/lib/permissions-ultra-fast'
import { TRPCError } from '@trpc/server'

export const permissionsRouter = createTRPCRouter({
    // Set permission for a user on a file
    setPermission: protectedProcedure
        .input(
            z.object({
                fileId: z.number(),
                userId: z.string(),
                permission: permissionSchema,
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId: currentUserId } = ctx.auth

            // Check if current user has edit permission on this file
            const canEdit = await hasPermission(
                currentUserId,
                input.fileId,
                'edit'
            )
            if (!canEdit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'You do not have permission to manage sharing for this file',
                })
            }

            const result = await setFilePermission(
                input.fileId,
                input.userId,
                input.permission
            )

            // Get file and user info for notification
            const [file, targetUser, currentUser] = await Promise.all([
                ctx.db.query.files.findFirst({
                    where: eq(files.id, input.fileId),
                    columns: { name: true },
                }),
                ctx.db.query.users.findFirst({
                    where: eq(users.id, input.userId),
                    columns: { name: true },
                }),
                ctx.db.query.users.findFirst({
                    where: eq(users.id, currentUserId),
                    columns: { name: true },
                }),
            ])

            // Create sharing notification for the user who received access
            if (
                file &&
                targetUser &&
                currentUser &&
                input.userId !== currentUserId
            ) {
                await ctx.db.insert(notifications).values({
                    userId: input.userId,
                    pageId: input.fileId,
                    content: `${currentUser.name} shared "${file.name}" with you (${input.permission} access)`,
                    type: 'share',
                    read: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            }

            return result
        }),

    // Remove permission for a user on a file
    removePermission: protectedProcedure
        .input(
            z.object({
                fileId: z.number(),
                userId: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId: currentUserId } = ctx.auth

            // Check if current user has edit permission on this file
            const canEdit = await hasPermission(
                currentUserId,
                input.fileId,
                'edit'
            )
            if (!canEdit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'You do not have permission to manage sharing for this file',
                })
            }

            return await removeFilePermission(input.fileId, input.userId)
        }),

    // Get all permissions for a file
    getFilePermissions: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has at least view permission
            const canView = await hasPermission(userId, input.fileId, 'view')
            if (!canView) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to view this file',
                })
            }

            return await getFilePermissions(input.fileId)
        }),

    // Get all permissions for a file including inherited permissions (optimized)
    getFilePermissionsWithInherited: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has at least view permission (using ultra-fast check)
            const userPermission = await superFastPermissionCheck(userId, input.fileId, 'view')
            if (!userPermission) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to view this file',
                })
            }

            // Single optimized query to get all permissions (direct and inherited) at once
            const [directPermissions, allEffectivePermissions] = await Promise.all([
                // Direct permissions query
                ctx.db.query.filePermissions.findMany({
                    where: eq(filePermissions.fileId, input.fileId),
                    with: {
                        user: {
                            columns: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                }),
                // All effective permissions for this file (direct and inherited)
                ctx.db.query.effectivePermissions.findMany({
                    where: eq(effectivePermissions.fileId, input.fileId),
                    with: {
                        user: {
                            columns: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        sourceFile: {
                            columns: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                })
            ])

            // Filter inherited permissions (non-direct only)
            const inheritedPermissions = allEffectivePermissions.filter(perm => !perm.isDirect)

            return {
                directPermissions,
                inheritedPermissions,
            }
        }),

    // Get user's permission for a specific file (ultra-fast)
    getUserPermission: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth
            return await superFastPermissionCheck(userId, input.fileId)
        }),

    // Check if user has specific permission (ultra-fast)
    checkPermission: protectedProcedure
        .input(
            z.object({
                fileId: z.number(),
                permission: permissionSchema,
            })
        )
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth
            const result = await superFastPermissionCheck(
                userId,
                input.fileId,
                input.permission
            )
            return result !== null
        }),

    // Get all files user has access to (ultra-fast for file tree filtering)
    getUserAccessibleFiles: protectedProcedure.query(async ({ ctx }) => {
        const { userId } = ctx.auth

        // Get all files first
        const allFiles = await ctx.db.query.files.findMany({
            columns: { id: true },
        })
        const fileIds = allFiles.map((f) => f.id)

        // Use ultra-fast batch permission check
        const permissions = await ultraFastBatchCheck(userId, fileIds)

        const accessibleFileIds: number[] = []
        permissions.forEach((permission, fileId) => {
            if (permission) {
                accessibleFileIds.push(fileId)
            }
        })

        return accessibleFileIds
    }),

    // Check if user can share a file (has edit permission) - ultra-fast
    canShareFile: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth
            const result = await superFastPermissionCheck(
                userId,
                input.fileId,
                'edit'
            )
            return result !== null
        }),

    // Check if user can edit a file (has edit permission) - ultra-fast
    canEditFile: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth
            const result = await superFastPermissionCheck(
                userId,
                input.fileId,
                'edit'
            )
            return result !== null
        }),

    // Batch permission check for multiple files (ultra-fast)
    batchCheckPermissions: protectedProcedure
        .input(
            z.object({
                fileIds: z.array(z.number()),
            })
        )
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Use the ultra-fast batch permission check
            const permissions = await ultraFastBatchCheck(userId, input.fileIds)

            // Transform the Map to an object that can be serialized
            const result: Record<
                number,
                {
                    userPermission: SharePermission | null
                    canEdit: boolean
                    canShare: boolean
                }
            > = {}

            permissions.forEach((permission, fileId) => {
                result[fileId] = {
                    userPermission: permission,
                    canEdit: permission === 'edit',
                    canShare: permission === 'edit', // Only edit permission allows sharing
                }
            })

            return result
        }),

    // Minimal cache invalidation for specific permission changes (ultra-fast)
    invalidatePermissionCachesWithDescendants: protectedProcedure
        .input(z.object({ fileId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has edit permission on this file
            const canEdit = await superFastPermissionCheck(
                userId,
                input.fileId,
                'edit'
            )
            if (!canEdit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'You do not have permission to manage permissions for this file',
                })
            }

            // Get all descendant files
            const descendants = await getFileDescendantsFast(input.fileId)

            // Minimal cache invalidation - clear all caches (ultra-fast operation)
            clearAllPermissionCaches()

            // Start async rebuild in background (non-blocking)
            asyncRebuildEffectivePermissions(input.fileId)

            return {
                success: true,
                invalidatedFiles: [input.fileId, ...descendants],
                message: `Minimal cache invalidation completed for ${descendants.length + 1} files`,
            }
        }),

    // ---- Feature 1: Programme membership (admin-only) ----

    // List the users directly assigned to a programme, with their access level
    getProgrammeMembers: adminProcedure
        .input(z.object({ programmeId: z.number() }))
        .query(async ({ ctx, input }) => {
            // Confirm the target file is actually a programme
            const programme = await ctx.db.query.files.findFirst({
                where: eq(files.id, input.programmeId),
                columns: { id: true, type: true, name: true },
            })
            if (!programme || programme.type !== FILE_TYPES.PROGRAMME) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Target file is not a programme',
                })
            }
            return await getFilePermissions(input.programmeId)
        }),

    // Assign a user to a programme at a chosen access level (admin picks the level)
    assignUserToProgramme: adminProcedure
        .input(
            z.object({
                programmeId: z.number(),
                userId: z.string(),
                permission: permissionSchema.default('view'),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId: currentUserId } = ctx.auth

            // Confirm the target file is a programme before granting
            const programme = await ctx.db.query.files.findFirst({
                where: eq(files.id, input.programmeId),
                columns: { id: true, type: true, name: true },
            })
            if (!programme || programme.type !== FILE_TYPES.PROGRAMME) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Target file is not a programme',
                })
            }

            // Grant (or update) the direct permission; this rebuilds the
            // effective-permission cache so the user also gains access to all
            // descendant pages/sheets/forms via inheritance.
            const result = await setFilePermission(
                input.programmeId,
                input.userId,
                input.permission
            )

            // Notify the assigned user (skip self-assignment)
            if (input.userId !== currentUserId) {
                const currentUser = await ctx.db.query.users.findFirst({
                    where: eq(users.id, currentUserId),
                    columns: { name: true },
                })
                await ctx.db.insert(notifications).values({
                    userId: input.userId,
                    pageId: input.programmeId,
                    content: `${currentUser?.name ?? 'An admin'} assigned you to "${programme.name}" (${input.permission} access)`,
                    type: 'share',
                    read: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            }

            return result
        }),

    // Remove a user's assignment from a programme
    removeUserFromProgramme: adminProcedure
        .input(
            z.object({
                programmeId: z.number(),
                userId: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const programme = await ctx.db.query.files.findFirst({
                where: eq(files.id, input.programmeId),
                columns: { id: true, type: true },
            })
            if (!programme || programme.type !== FILE_TYPES.PROGRAMME) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Target file is not a programme',
                })
            }
            return await removeFilePermission(input.programmeId, input.userId)
        }),
})
