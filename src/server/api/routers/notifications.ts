import { z } from 'zod'
import { and, eq, gt, ne, desc, count, sql, inArray } from 'drizzle-orm'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
    messages,
    messageReads,
    notifications,
    files,
    users,
} from '~/server/db/schema'

export const notificationsRouter = createTRPCRouter({
    // Get all notifications for the current user with pagination and filtering
    getAll: protectedProcedure
        .input(
            z
                .object({
                    limit: z.number().min(1).max(100).default(50),
                    offset: z.number().min(0).default(0),
                    type: z.string().optional(), // Filter by notification type
                    read: z.boolean().optional(), // Filter by read status
                })
                .optional()
        )
        .query(async ({ ctx, input = {} }) => {
            const { limit = 50, offset = 0, type, read } = input

            const whereConditions = [eq(notifications.userId, ctx.auth.userId)]

            if (type) {
                whereConditions.push(eq(notifications.type, type))
            }

            if (read !== undefined) {
                whereConditions.push(eq(notifications.read, read))
            }

            const notificationsList = await ctx.db
                .select({
                    id: notifications.id,
                    pageId: notifications.pageId,
                    userId: notifications.userId,
                    content: notifications.content,
                    type: notifications.type,
                    read: notifications.read,
                    createdAt: notifications.createdAt,
                    updatedAt: notifications.updatedAt,
                    userName: users.name,
                    pageName: files.name,
                })
                .from(notifications)
                .leftJoin(users, eq(notifications.userId, users.id))
                .leftJoin(files, eq(notifications.pageId, files.id))
                .where(and(...whereConditions))
                .orderBy(desc(notifications.createdAt))
                .limit(limit)
                .offset(offset)

            // Get total count for pagination
            const [totalResult] = await ctx.db
                .select({ count: count() })
                .from(notifications)
                .where(and(...whereConditions))

            return {
                notifications: notificationsList,
                total: totalResult?.count || 0,
                hasMore: offset + limit < (totalResult?.count || 0),
            }
        }),

    // Get notification statistics for the current user
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const stats = await ctx.db
            .select({
                type: notifications.type,
                read: notifications.read,
                count: count(),
            })
            .from(notifications)
            .where(eq(notifications.userId, ctx.auth.userId))
            .groupBy(notifications.type, notifications.read)

        const summary = {
            total: 0,
            unread: 0,
            byType: {} as Record<string, { total: number; unread: number }>,
        }

        stats.forEach(({ type, read, count: itemCount }) => {
            summary.total += itemCount
            if (!read) {
                summary.unread += itemCount
            }

            const notificationType = type || 'general'
            if (!summary.byType[notificationType]) {
                summary.byType[notificationType] = { total: 0, unread: 0 }
            }
            summary.byType[notificationType].total += itemCount
            if (!read) {
                summary.byType[notificationType].unread += itemCount
            }
        })

        return summary
    }),

    // Mark a single notification as read
    markAsRead: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .update(notifications)
                .set({
                    read: true,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(notifications.id, input.id),
                        eq(notifications.userId, ctx.auth.userId) // Security: only update own notifications
                    )
                )
                .returning()

            if (result.length === 0) {
                throw new Error('Notification not found or not authorized')
            }

            return { success: true }
        }),

    // Mark multiple notifications as read
    markMultipleAsRead: protectedProcedure
        .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .update(notifications)
                .set({
                    read: true,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        inArray(notifications.id, input.ids),
                        eq(notifications.userId, ctx.auth.userId)
                    )
                )
                .returning()

            return {
                success: true,
                updatedCount: result.length,
            }
        }),

    // Mark all notifications as read for the current user
    markAllAsRead: protectedProcedure
        .input(
            z
                .object({
                    type: z.string().optional(), // Optionally mark only specific type as read
                })
                .optional()
        )
        .mutation(async ({ ctx, input = {} }) => {
            const whereConditions = [eq(notifications.userId, ctx.auth.userId)]

            if (input.type) {
                whereConditions.push(eq(notifications.type, input.type))
            }

            const result = await ctx.db
                .update(notifications)
                .set({
                    read: true,
                    updatedAt: new Date(),
                })
                .where(and(...whereConditions))
                .returning()

            return {
                success: true,
                updatedCount: result.length,
            }
        }),

    // Delete a notification
    deleteNotification: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .delete(notifications)
                .where(
                    and(
                        eq(notifications.id, input.id),
                        eq(notifications.userId, ctx.auth.userId)
                    )
                )
                .returning()

            if (result.length === 0) {
                throw new Error('Notification not found or not authorized')
            }

            return { success: true }
        }),

    // Delete multiple notifications
    deleteMultipleNotifications: protectedProcedure
        .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .delete(notifications)
                .where(
                    and(
                        inArray(notifications.id, input.ids),
                        eq(notifications.userId, ctx.auth.userId)
                    )
                )
                .returning()

            return {
                success: true,
                deletedCount: result.length,
            }
        }),

    // Delete all read notifications for the current user
    deleteAllReadNotifications: protectedProcedure
        .input(
            z
                .object({
                    type: z.string().optional(), // Optionally delete only specific type
                })
                .optional()
        )
        .mutation(async ({ ctx, input = {} }) => {
            const whereConditions = [
                eq(notifications.userId, ctx.auth.userId),
                eq(notifications.read, true),
            ]

            if (input.type) {
                whereConditions.push(eq(notifications.type, input.type))
            }

            const result = await ctx.db
                .delete(notifications)
                .where(and(...whereConditions))
                .returning()

            return {
                success: true,
                deletedCount: result.length,
            }
        }),

    // Create a new notification (internal use)
    create: protectedProcedure
        .input(
            z.object({
                userId: z.string(),
                pageId: z.number(),
                content: z.string(),
                type: z.string().default('general'),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Prevent duplicate notifications within a short time frame
            const recentNotification =
                await ctx.db.query.notifications.findFirst({
                    where: and(
                        eq(notifications.userId, input.userId),
                        eq(notifications.pageId, input.pageId),
                        eq(notifications.type, input.type),
                        gt(
                            notifications.createdAt,
                            new Date(Date.now() - 5 * 60 * 1000)
                        ) // 5 minutes
                    ),
                })

            if (
                recentNotification &&
                recentNotification.content === input.content
            ) {
                return { success: true, duplicate: true }
            }

            const [notification] = await ctx.db
                .insert(notifications)
                .values({
                    userId: input.userId,
                    pageId: input.pageId,
                    content: input.content,
                    type: input.type,
                    read: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning()

            return { success: true, notification, duplicate: false }
        }),

    // Enhanced message tracking system
    getUnseenMessagesByPage: protectedProcedure.query(async ({ ctx }) => {
        // Get all pages (files of type "page") that the user has access to
        const userPages = await ctx.db
            .select({
                id: files.id,
                name: files.name,
            })
            .from(files)
            .where(eq(files.type, 'page'))

        // Get all messageReads for this user
        const reads = await ctx.db.query.messageReads.findMany({
            where: eq(messageReads.userId, ctx.auth.userId),
        })

        // For each page, count unseen messages
        const result = []
        for (const page of userPages) {
            const lastSeen =
                reads.find((r) => r.pageId === page.id)?.lastSeenMessageId ?? 0

            const unseenMessages = await ctx.db
                .select({ count: count() })
                .from(messages)
                .where(
                    and(
                        eq(messages.fileId, page.id),
                        gt(messages.id, lastSeen),
                        ne(messages.userId, ctx.auth.userId) // Don't count own messages
                    )
                )

            const unseenCount = unseenMessages[0]?.count || 0

            if (unseenCount > 0) {
                // Get the latest unseen message for preview
                const latestMessage = await ctx.db.query.messages.findFirst({
                    where: and(
                        eq(messages.fileId, page.id),
                        gt(messages.id, lastSeen),
                        ne(messages.userId, ctx.auth.userId)
                    ),
                    orderBy: desc(messages.createdAt),
                    with: {
                        user: {
                            columns: { name: true },
                        },
                    },
                })

                result.push({
                    pageId: page.id,
                    pageName: page.name,
                    unseenCount,
                    latestMessage: latestMessage
                        ? {
                              content:
                                  latestMessage.content.slice(0, 100) +
                                  (latestMessage.content.length > 100
                                      ? '...'
                                      : ''),
                              userName:
                                  latestMessage.user?.name || 'Unknown User',
                              createdAt: latestMessage.createdAt,
                          }
                        : null,
                })
            }
        }

        return result.sort(
            (a, b) =>
                new Date(b.latestMessage?.createdAt || 0).getTime() -
                new Date(a.latestMessage?.createdAt || 0).getTime()
        )
    }),

    // Mark messages as read for a specific page
    markMessagesAsRead: protectedProcedure
        .input(
            z.object({
                pageId: z.number(),
                lastMessageId: z.number().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            let lastMessageId = input.lastMessageId

            // If no lastMessageId provided, get the latest message ID for this page
            if (!lastMessageId) {
                const latestMessage = await ctx.db.query.messages.findFirst({
                    where: eq(messages.fileId, input.pageId),
                    orderBy: desc(messages.id),
                    columns: { id: true },
                })
                lastMessageId = latestMessage?.id || 0
            }

            // Upsert the messageRead record
            await ctx.db
                .insert(messageReads)
                .values({
                    userId: ctx.auth.userId,
                    pageId: input.pageId,
                    lastSeenMessageId: lastMessageId,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [messageReads.userId, messageReads.pageId],
                    set: {
                        lastSeenMessageId: lastMessageId,
                        updatedAt: new Date(),
                    },
                })

            return { success: true }
        }),

    // Get real-time notification preferences for user
    getPreferences: protectedProcedure.query(async ({ ctx }) => {
        // This could be extended to store user preferences in the database
        // For now, return default preferences
        return {
            emailNotifications: true,
            pushNotifications: true,
            mentionNotifications: true,
            chatNotifications: true,
            editNotifications: false,
            types: {
                chat: true,
                mention: true,
                edit: false,
                share: true,
                comment: true,
            },
        }
    }),

    // Update notification preferences
    updatePreferences: protectedProcedure
        .input(
            z.object({
                emailNotifications: z.boolean().optional(),
                pushNotifications: z.boolean().optional(),
                mentionNotifications: z.boolean().optional(),
                chatNotifications: z.boolean().optional(),
                editNotifications: z.boolean().optional(),
                types: z.record(z.boolean()).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Store preferences in user settings or separate table
            // For now, just return success
            return { success: true, preferences: input }
        }),
})
