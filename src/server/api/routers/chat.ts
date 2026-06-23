import { z } from 'zod'
import { eq, ne, and, desc, asc, sql, inArray, gt } from 'drizzle-orm'

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
    messages,
    files,
    users,
    notifications,
    filePermissions,
    effectivePermissions,
} from '~/server/db/schema'

export const chatRouter = createTRPCRouter({
    // Get messages for a specific file (with optional since and limit for fast incremental fetching)
    getFileMessages: protectedProcedure
        .input(
            z.object({
                fileId: z.number().int().positive('File ID must be a positive integer'),
                since: z.string().datetime().optional(), // ISO timestamp
                limit: z.number().int().min(1).max(100).optional(), // max 100 per page
            })
        )
        .query(async ({ ctx, input }) => {
            const whereParts = [eq(messages.fileId, input.fileId)]
            if (input.since) {
                whereParts.push(gt(messages.createdAt, new Date(input.since)))
            }
            const whereClause = and(...whereParts)

            const fileMessages = await ctx.db
                .select({
                    id: messages.id,
                    content: messages.content,
                    createdAt: messages.createdAt,
                    updatedAt: messages.updatedAt,
                    fileId: messages.fileId,
                    userId: messages.userId,
                    user: {
                        id: users.id,
                        email: users.email,
                    },
                })
                .from(messages)
                .leftJoin(users, eq(messages.userId, users.id))
                .where(whereClause)
                .orderBy(asc(messages.createdAt))
                .limit(input.limit || 50) // Default to 50

            return fileMessages
        }),

    // Send a new message
    sendMessage: protectedProcedure
        .input(
            z.object({
                fileId: z
                    .number()
                    .int()
                    .positive('File ID must be a positive integer'),
                content: z.string().min(1, 'Message content cannot be empty'),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // 1. Insert the message
            const [message] = await ctx.db
                .insert(messages)
                .values({
                    fileId: input.fileId,
                    userId,
                    content: input.content,
                })
                .returning()

            // 2. Get page info
            const page = await ctx.db.query.files.findFirst({
                where: eq(files.id, input.fileId),
                columns: { name: true },
            })

            const pageName = page?.name || 'page'

            // // 3. Detect @mentions in the message
            // const mentionPattern = /@(\w+)/g
            // const mentions = [...input.content.matchAll(mentionPattern)]
            // const mentionedUsernames = [
            //     ...new Set(mentions.map((match) => match[1].toLowerCase())),
            // ]

            // 4. Get current user info for notifications
            const filePermittedUsers = await ctx.db.query.filePermissions.findMany({
                where: eq(filePermissions.fileId, input.fileId),
                columns: { userId: true },
            })

            const adminUsers = await ctx.db.query.users.findMany({
                where: eq(users.role, 'admin'),
                columns: { id: true} ,
            })

            // join both sets of users 
            const allUsers = new Set([
                ...filePermittedUsers.map((p) => p.userId),
                ...adminUsers.map((u) => u.id),
            ])

            // remove the sender from the list
            allUsers.delete(userId)

            // 5. Handle @mentions first (higher priority)
            // if (mentionedUsernames.length > 0) {
            //     // Find users by name (case-insensitive)
            //     const mentionedUsers = await ctx.db.query.users.findMany({
            //         where: sql`LOWER(${users.name}) = ANY(${mentionedUsernames})`,
            //         columns: { id: true, name: true },
            //     })

            //     if (mentionedUsers.length > 0) {
            //         await ctx.db.insert(notifications).values(
            //             mentionedUsers
            //                 .filter((user) => user.id !== userId) // Don't notify self
            //                 .map((user) => ({
            //                     userId: user.id,
            //                     pageId: input.fileId,
            //                     content: `${currentUser?.name || 'Someone'} mentioned you in ${pageName}: "${input.content.slice(0, 100)}"`,
            //                     type: 'mention',
            //                     read: false,
            //                     createdAt: new Date(),
            //                     updatedAt: new Date(),
            //                 }))
            //         )
            //     }
            // }

            // 6. Find all users who have sent a message in this file (page), except the sender and mentioned users

            const mentionedUserIds = new Set()
            //     (
            //         await ctx.db.query.users.findMany({
            //             where: sql`LOWER(${users.name}) = ANY(${mentionedUsernames})`,
            //             columns: { id: true },
            //         })
            //     ).map((u) => u.id)

            if (allUsers.size > 0) {
                await ctx.db.insert(notifications).values(
                    Array.from(allUsers).map((u) => ({
                        userId: String(u),
                        pageId: input.fileId,
                        content: `New message in ${pageName}: "${input.content.slice(0, 100)}"`,
                        type: 'chat',
                        read: false,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }))
                )
            }

            return message
        }),

    // Get recent chats across all files
    getRecentChats: protectedProcedure.query(async ({ ctx }) => {
        const { userId } = ctx.auth

        // First get user's role
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { role: true },
        })

        // Get the file IDs the user has access to 
        let fileIds: number[]
        if (user?.role === 'admin') {
            // For admins, get all files in one query
            const allFiles = await ctx.db.query.files.findMany({
                columns: { id: true },
            })
            fileIds = allFiles.map(f => f.id)
        } else {
            // For non-admins, use the effective-permission cache so that a
            // programme-level assignment also surfaces chats on every
            // descendant page/sheet/form (inherited access), not just files
            // the user was granted directly.
            const userPermissions =
                await ctx.db.query.effectivePermissions.findMany({
                    where: eq(effectivePermissions.userId, userId),
                    columns: { fileId: true },
                })
            fileIds = userPermissions.map((p) => p.fileId)
        }

        if (fileIds.length === 0) {
            return []
        }

        // Get messages for the accessible files
        const recentChats = await ctx.db
            .select({
                message: messages,
                file: files,
                user: users,
            })
            .from(messages)
            .leftJoin(files, eq(messages.fileId, files.id))
            .leftJoin(users, eq(messages.userId, users.id))
            .where(inArray(messages.fileId, fileIds))
            .orderBy(desc(messages.createdAt))
            .limit(50)

        // Group by file
        const chatsByFile = recentChats.reduce(
            (acc, { message, file, user }) => {
                const fileId = message.fileId;
                if (fileId !== null && fileId !== undefined) {
                    if (!acc[fileId]) {
                        acc[fileId] = {
                            file,
                            lastMessage: {
                                ...message,
                                user,
                            },
                            unreadCount: 0,
                        };
                    }
                }
                return acc;
            },
            {} as Record<number, any>
        )

        return Object.values(chatsByFile)
    }),
})
