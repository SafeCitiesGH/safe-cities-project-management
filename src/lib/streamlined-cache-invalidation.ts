// Streamlined cache invalidation system for file tree and permissions
import { type api } from '~/trpc/react'
import { fileTreeCache } from './file-tree-cache'

/**
 * Cache invalidation strategy levels:
 * 1. Ultra-Fast: Minimal invalidation (specific data only)
 * 2. Smart: Balanced invalidation with targeted cache rebuilding
 * 3. Comprehensive: Complete invalidation (slower but thorough)
 */

/**
 * File-Tree Cache Invalidation
 * ===========================
 */

/**
 * Minimal file tree cache invalidation - only invalidate what's absolutely necessary
 */
export function ultraFastInvalidateFileCaches(
    utils: ReturnType<typeof api.useUtils>
): Promise<unknown[]> {
    // Log operation for debugging
    console.debug('🚀 Ultra-fast file tree cache invalidation')

    // Invalidate both file tree queries used throughout the app
    return Promise.all([
        utils.files.getFilteredFileTree.invalidate(),
        utils.files.getFileTree.invalidate(), // Also invalidate for NewFileDialog
    ])
}

/**
 * Smart file tree invalidation with staged approach
 * Stage 1: Quick invalidation for UI responsiveness
 * Stage 2: More comprehensive background invalidation
 */
export function smartInvalidateFileCaches(
    utils: ReturnType<typeof api.useUtils>,
    fileId?: number
): Promise<unknown[]> {
    console.debug('🔄 Smart file tree cache invalidation')

    // Start with ultra fast invalidation for immediate UI update
    const promises = [ultraFastInvalidateFileCaches(utils)]

    // Clear file-specific cache if fileId is provided
    if (fileId) {
        fileTreeCache.clearFileCache(fileId)
    }

    // Add background invalidation tasks (will run in parallel)
    promises.push(
        // Prefetch the file tree for future use
        utils.files.getFilteredFileTree.fetch()
    )

    return Promise.all(promises)
}

/**
 * Complete file tree cache rebuild - use when major changes occur
 * This performs a full invalidation and rebuilds caches
 */
export function rebuildFileCaches(
    utils: ReturnType<typeof api.useUtils>
): Promise<unknown[]> {
    console.debug('🔄 Complete file tree cache rebuild started')

    // Clear all in-memory caches
    fileTreeCache.clearAll()

    // Invalidate everything related to files
    const promises = [
        ultraFastInvalidateFileCaches(utils),
        utils.files.getFileById.invalidate(),
        utils.files.getParentChain.invalidate(),
    ]

    // Prefetch main data to rebuild caches
    promises.push(
        utils.files.getFilteredFileTree.fetch(),
        utils.files.getFileTree.fetch()
    )

    return Promise.all(promises)
}

/**
 * Permission Cache Invalidation
 * ===========================
 */

/**
 * Ultra-minimal permission cache invalidation - strategic invalidation only
 */
export function ultraFastInvalidatePermissionCaches(
    utils: ReturnType<typeof api.useUtils>,
    fileId?: number
): Promise<unknown[]> {
    console.debug('🚀 Ultra-fast permission cache invalidation')

    const promises = [
        // Only invalidate the most frequently used permission checks
        utils.permissions.getUserPermission.invalidate(),
        utils.permissions.batchCheckPermissions.invalidate(),
        utils.permissions.canEditFile.invalidate(),
        utils.permissions.canShareFile.invalidate(),
    ]

    // Only invalidate specific file permissions if fileId is provided
    if (fileId) {
        promises.push(
            utils.permissions.getUserPermission.invalidate({ fileId }),
            utils.permissions.canEditFile.invalidate({ fileId }),
            utils.permissions.canShareFile.invalidate({ fileId }),
            utils.permissions.getFilePermissionsWithInherited.invalidate({
                fileId,
            })
        )
    }

    return Promise.all(promises)
}

/**
 * Smart permission cache invalidation with staged approach
 */
export async function smartInvalidatePermissionCaches(
    utils: ReturnType<typeof api.useUtils>,
    fileId: number
): Promise<unknown> {
    console.debug(`🔄 Smart permission cache invalidation for file ${fileId}`)

    try {
        // Stage 1: Quick invalidation for UI responsiveness
        await ultraFastInvalidatePermissionCaches(utils, fileId)

        // Stage 2: In parallel, perform additional invalidations and prefetches
        const promises = [
            // Prefetch common permission checks to rebuild cache
            utils.permissions.canEditFile.fetch({ fileId }),
            utils.permissions.canShareFile.fetch({ fileId }),
            utils.permissions.getUserPermission.fetch({ fileId }),
        ]

        await Promise.all(promises)

        return {
            success: true,
            message: `Smart cache invalidation completed for file ${fileId}`,
        }
    } catch (error) {
        console.error('Smart cache invalidation failed:', error)
        // Fallback to ultra-fast invalidation
        return ultraFastInvalidatePermissionCaches(utils, fileId)
    }
}

/**
 * Comprehensive permission cache invalidation for when permissions are modified
 */
export function comprehensivePermissionInvalidation(
    utils: ReturnType<typeof api.useUtils>,
    fileId: number
): Promise<unknown[]> {
    console.debug(`🔄 Comprehensive permission invalidation for file ${fileId}`)

    // First, clear the in-memory cache for this file
    if (fileId) {
        fileTreeCache.clearFileCache(fileId)
    }

    const invalidationPromises = [
        // Invalidate all permission-related caches
        utils.permissions.getUserPermission.invalidate(),
        utils.permissions.canEditFile.invalidate(),
        utils.permissions.canShareFile.invalidate(),
        utils.permissions.batchCheckPermissions.invalidate(),
        utils.permissions.getFilePermissionsWithInherited.invalidate(),

        // Also invalidate specific file permissions
        utils.permissions.getUserPermission.invalidate({ fileId }),
        utils.permissions.canEditFile.invalidate({ fileId }),
        utils.permissions.canShareFile.invalidate({ fileId }),
        utils.permissions.getFilePermissionsWithInherited.invalidate({
            fileId,
        }),

        // Also invalidate the file tree as permissions can affect what's shown
        utils.files.getFilteredFileTree.invalidate(),
    ]

    return Promise.all(invalidationPromises)
}

/**
 * Combined Cache Invalidation
 * ==========================
 */

/**
 * Special invalidation for file tree permissions
 */
export async function invalidateFileTreePermissions(
    utils: ReturnType<typeof api.useUtils>,
    fileId: number
): Promise<void> {
    console.debug(`🔄 Invalidating file tree permissions for file ${fileId}`)

    // Clear in-memory cache for this file
    fileTreeCache.clearFileCache(fileId)

    await Promise.all([
        utils.permissions.batchCheckPermissions.invalidate(),
        utils.permissions.getUserPermission.invalidate({ fileId }),
        utils.files.getFilteredFileTree.invalidate(),
    ])
}

/**
 * Special fast invalidation for file creation
 */
export function ultraFastFileCreationInvalidation(
    utils: ReturnType<typeof api.useUtils>
): Promise<unknown[]> {
    console.debug('🚀 Ultra-fast file creation cache invalidation')

    return Promise.all([
        utils.files.getFilteredFileTree.invalidate(),
        utils.files.getFileTree.invalidate(),
        // Force immediate refetch to update UI
        utils.files.getFilteredFileTree.refetch(),
    ])
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
    return {
        fileTreeCache: fileTreeCache.getStats(),
    }
}

/**
 * Log all cache statistics to console
 */
export function logCacheStats() {
    console.log('===== Cache Statistics =====')
    const stats = getCacheStats()
    console.log(JSON.stringify(stats, null, 2))
    return stats
}
