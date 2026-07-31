import { z } from 'zod'
import { eq, ne, and, desc, asc, sql, inArray, gt } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { type db } from '~/server/db'
import {
    messages,
    files,
    users,
    notifications,
    filePermissions,
    effectivePermissions,
    conversations,
    conversationMembers,
} from '~/server/db/schema'

// Throws unless the user belongs to the conversation. Conversations are private
// to their members, so every read/write goes through this.
async function assertConversationMember(
    database: typeof db,
    conversationId: number,
    userId: string
) {
    const membership = await database.query.conversationMembers.findFirst({
        where: and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId)
        ),
        columns: { id: true },
    })
    if (!membership) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not a member of this chat',
        })
    }
}

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

    // Send a new message — to a file chat (fileId) OR a standalone
    // conversation (conversationId). Exactly one must be provided.
    sendMessage: protectedProcedure
        .input(
            z
                .object({
                    fileId: z.number().int().positive().optional(),
                    conversationId: z.number().int().positive().optional(),
                    content: z
                        .string()
                        .min(1, 'Message content cannot be empty'),
                })
                .refine(
                    (data) =>
                        (data.fileId != null) !==
                        (data.conversationId != null),
                    {
                        message:
                            'Provide exactly one of fileId or conversationId',
                    }
                )
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Standalone conversation message: only members may post.
            if (input.conversationId != null) {
                await assertConversationMember(
                    ctx.db,
                    input.conversationId,
                    userId
                )
                const [message] = await ctx.db
                    .insert(messages)
                    .values({
                        conversationId: input.conversationId,
                        userId,
                        content: input.content,
                    })
                    .returning()
                return message
            }

            const fileId = input.fileId
            if (fileId == null) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'fileId or conversationId is required',
                })
            }

            // 1. Insert the message
            const [message] = await ctx.db
                .insert(messages)
                .values({
                    fileId,
                    userId,
                    content: input.content,
                })
                .returning()

            // 2. Get page info
            const page = await ctx.db.query.files.findFirst({
                where: eq(files.id, fileId),
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
                where: eq(filePermissions.fileId, fileId),
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
                        pageId: fileId,
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

    // Create a private conversation with the chosen members. The creator is
    // always added, so a chat has at least one member.
    createConversation: protectedProcedure
        .input(
            z.object({
                title: z
                    .string()
                    .trim()
                    .min(1, 'Chat name cannot be empty')
                    .max(256),
                memberIds: z.array(z.string()).default([]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            const [conversation] = await ctx.db
                .insert(conversations)
                .values({ title: input.title, createdBy: userId })
                .returning()

            if (!conversation) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create conversation',
                })
            }

            // Creator + selected members, de-duplicated.
            const memberIds = Array.from(
                new Set([userId, ...input.memberIds])
            )
            await ctx.db.insert(conversationMembers).values(
                memberIds.map((memberId) => ({
                    conversationId: conversation.id,
                    userId: memberId,
                }))
            )

            return conversation
        }),

    // List the conversations the current user is a member of, with a
    // last-message preview and the member list (for display names).
    getConversations: protectedProcedure.query(async ({ ctx }) => {
        const { userId } = ctx.auth

        const myMemberships = await ctx.db.query.conversationMembers.findMany({
            where: eq(conversationMembers.userId, userId),
            columns: { conversationId: true },
        })
        const conversationIds = myMemberships.map((m) => m.conversationId)
        if (conversationIds.length === 0) return []

        const myConversations = await ctx.db.query.conversations.findMany({
            where: inArray(conversations.id, conversationIds),
            orderBy: desc(conversations.updatedAt),
        })

        // Last message per conversation.
        const conversationMessages = await ctx.db
            .select({
                content: messages.content,
                createdAt: messages.createdAt,
                conversationId: messages.conversationId,
            })
            .from(messages)
            .where(inArray(messages.conversationId, conversationIds))
            .orderBy(desc(messages.createdAt))

        const lastByConversation: Record<
            number,
            (typeof conversationMessages)[number]
        > = {}
        for (const message of conversationMessages) {
            if (
                message.conversationId != null &&
                !lastByConversation[message.conversationId]
            ) {
                lastByConversation[message.conversationId] = message
            }
        }

        // Members per conversation (for showing participant names).
        const memberRows = await ctx.db
            .select({
                conversationId: conversationMembers.conversationId,
                userId: conversationMembers.userId,
                name: users.name,
                email: users.email,
            })
            .from(conversationMembers)
            .leftJoin(users, eq(conversationMembers.userId, users.id))
            .where(inArray(conversationMembers.conversationId, conversationIds))

        const membersByConversation: Record<
            number,
            { userId: string; name: string | null; email: string | null }[]
        > = {}
        for (const row of memberRows) {
            ;(membersByConversation[row.conversationId] ??= []).push({
                userId: row.userId,
                name: row.name,
                email: row.email,
            })
        }

        return myConversations.map((conversation) => ({
            conversation,
            lastMessage: lastByConversation[conversation.id] ?? null,
            members: membersByConversation[conversation.id] ?? [],
        }))
    }),

    // Messages for a conversation — only if the caller is a member.
    getConversationMessages: protectedProcedure
        .input(
            z.object({
                conversationId: z.number().int().positive(),
                since: z.string().datetime().optional(),
                limit: z.number().int().min(1).max(100).optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            await assertConversationMember(
                ctx.db,
                input.conversationId,
                ctx.auth.userId
            )

            const whereParts = [
                eq(messages.conversationId, input.conversationId),
            ]
            if (input.since) {
                whereParts.push(gt(messages.createdAt, new Date(input.since)))
            }

            return ctx.db
                .select({
                    id: messages.id,
                    content: messages.content,
                    createdAt: messages.createdAt,
                    updatedAt: messages.updatedAt,
                    conversationId: messages.conversationId,
                    userId: messages.userId,
                    user: { id: users.id, email: users.email },
                })
                .from(messages)
                .leftJoin(users, eq(messages.userId, users.id))
                .where(and(...whereParts))
                .orderBy(asc(messages.createdAt))
                .limit(input.limit || 50)
        }),

    // A conversation's metadata + members — only if the caller is a member.
    getConversation: protectedProcedure
        .input(z.object({ conversationId: z.number().int().positive() }))
        .query(async ({ ctx, input }) => {
            await assertConversationMember(
                ctx.db,
                input.conversationId,
                ctx.auth.userId
            )

            const conversation = await ctx.db.query.conversations.findFirst({
                where: eq(conversations.id, input.conversationId),
            })
            if (!conversation) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Conversation not found',
                })
            }

            const memberRows = await ctx.db
                .select({
                    userId: conversationMembers.userId,
                    name: users.name,
                    email: users.email,
                })
                .from(conversationMembers)
                .leftJoin(users, eq(conversationMembers.userId, users.id))
                .where(
                    eq(conversationMembers.conversationId, input.conversationId)
                )

            return { ...conversation, members: memberRows }
        }),
})
