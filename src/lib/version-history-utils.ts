import { eq, and } from 'drizzle-orm'
import { createHash } from 'crypto'
import { pageVersionHistory } from '~/server/db/schema'
import { type db } from '~/server/db'

/**
 * Creates a SHA-256 hash of the content for efficient duplicate detection
 */
function createContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Saves content to version history, updating timestamp if content already exists
 * instead of creating duplicate entries. Uses content hash for efficient duplicate detection.
 */
export async function saveVersionHistoryWithDeduplication(
    database: typeof db,
    {
        fileId,
        content,
        version,
        createdBy,
        changeDescription = 'Auto-saved version',
    }: {
        fileId: number
        content: string
        version: number
        createdBy: string
        changeDescription?: string
    }
) {
    const contentHash = createContentHash(content)

    try {
        // Check if this exact content hash already exists for this file
        const existingVersion =
            await database.query.pageVersionHistory.findFirst({
                where: and(
                    eq(pageVersionHistory.fileId, fileId),
                    eq(pageVersionHistory.contentHash, contentHash)
                ),
                columns: { id: true, createdAt: true },
            })

        if (existingVersion) {
            // Update the timestamp of the existing version instead of creating a duplicate
            await database
                .update(pageVersionHistory)
                .set({
                    createdAt: new Date(),
                    createdBy,
                    changeDescription,
                })
                .where(eq(pageVersionHistory.id, existingVersion.id))

            return { updated: true, versionId: existingVersion.id }
        } else {
            // Create new version history entry
            const [newVersion] = await database
                .insert(pageVersionHistory)
                .values({
                    fileId,
                    content,
                    contentHash,
                    version,
                    createdBy,
                    changeDescription,
                })
                .returning({ id: pageVersionHistory.id })

            return { updated: false, versionId: newVersion?.id }
        }
    } catch (error) {
        // If there's a unique constraint violation (should be rare with our pre-check),
        // fall back to updating the existing record
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
        ) {
            const existingVersion =
                await database.query.pageVersionHistory.findFirst({
                    where: and(
                        eq(pageVersionHistory.fileId, fileId),
                        eq(pageVersionHistory.contentHash, contentHash)
                    ),
                    columns: { id: true },
                })

            if (existingVersion) {
                await database
                    .update(pageVersionHistory)
                    .set({
                        createdAt: new Date(),
                        createdBy,
                        changeDescription,
                    })
                    .where(eq(pageVersionHistory.id, existingVersion.id))

                return { updated: true, versionId: existingVersion.id }
            }
        }

        // Re-throw if it's not a duplicate constraint error
        throw error
    }
}
