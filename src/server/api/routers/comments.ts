import { z } from 'zod'
import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
    comments,
    files,
    users,
    notifications,
    filePermissions,
} from '~/server/db/schema'
import { hasPermission } from '~/lib/permissions'
import { TRPCError } from '@trpc/server'

export const commentsRouter = createTRPCRouter({
    // Get comments for a specific file
    getFileComments: protectedProcedure
        .input(
            z.object({
                fileId: z.number().int().positive(),
                includeResolved: z.boolean().default(true),
            })
        )
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has at least view permission on this file
            const canView = await hasPermission(userId, input.fileId, 'view')
            if (!canView) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to view this file',
                })
            }

            const whereConditions = [eq(comments.fileId, input.fileId)]

            if (!input.includeResolved) {
                whereConditions.push(eq(comments.isResolved, false))
            }

            const fileComments = await ctx.db
                .select({
                    id: comments.id,
                    content: comments.content,
                    parentId: comments.parentId,
                    isResolved: comments.isResolved,
                    createdAt: comments.createdAt,
                    updatedAt: comments.updatedAt,
                    fileId: comments.fileId,
                    userId: comments.userId,
                    user: {
                        id: users.id,
                        name: users.name,
                        email: users.email,
                    },
                })
                .from(comments)
                .leftJoin(users, eq(comments.userId, users.id))
                .where(and(...whereConditions))
                .orderBy(asc(comments.createdAt))

            // Group comments by thread (organize replies under parent comments)
            const commentMap = new Map()
            const rootComments: any[] = []

            fileComments.forEach((comment) => {
                commentMap.set(comment.id, { ...comment, replies: [] })
            })

            fileComments.forEach((comment) => {
                if (comment.parentId) {
                    const parent = commentMap.get(comment.parentId)
                    if (parent) {
                        parent.replies.push(commentMap.get(comment.id))
                    }
                } else {
                    rootComments.push(commentMap.get(comment.id))
                }
            })

            return rootComments
        }),

    // Create a new comment
    createComment: protectedProcedure
        .input(
            z.object({
                fileId: z.number().int().positive(),
                content: z.string().min(1),
                parentId: z.number().optional(), // For replies
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has at least comment permission on this file
            const canComment = await hasPermission(
                userId,
                input.fileId,
                'comment'
            )
            if (!canComment) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'You do not have permission to comment on this file',
                })
            }

            // If this is a reply, verify the parent comment exists and belongs to the same file
            if (input.parentId) {
                const parentComment = await ctx.db.query.comments.findFirst({
                    where: eq(comments.id, input.parentId),
                    columns: { fileId: true },
                })

                if (!parentComment) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Parent comment not found',
                    })
                }

                if (parentComment.fileId !== input.fileId) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Parent comment belongs to a different file',
                    })
                }
            }

            // Create the comment
            const [comment] = await ctx.db
                .insert(comments)
                .values({
                    fileId: input.fileId,
                    userId,
                    content: input.content,
                    parentId: input.parentId || null,
                    isResolved: false,
                })
                .returning()

            // Get file and user info for notifications
            const [file, currentUser] = await Promise.all([
                ctx.db.query.files.findFirst({
                    where: eq(files.id, input.fileId),
                    columns: { name: true },
                }),
                ctx.db.query.users.findFirst({
                    where: eq(users.id, userId),
                    columns: { name: true },
                }),
            ])

            if (file && currentUser) {
                // Get users who have permission to view this file and should be notified
                const usersWithAccess = await ctx.db
                    .select({
                        userId: filePermissions.userId,
                    })
                    .from(filePermissions)
                    .where(eq(filePermissions.fileId, input.fileId))

                // If this is a reply, also notify the parent comment author
                let parentAuthorId: string | null = null
                if (input.parentId) {
                    const parentComment = await ctx.db.query.comments.findFirst(
                        {
                            where: eq(comments.id, input.parentId),
                            columns: { userId: true },
                        }
                    )
                    parentAuthorId = parentComment?.userId || null
                }

                // Create comment notifications
                const notificationRecipients = new Set(
                    usersWithAccess
                        .map((u) => u.userId)
                        .filter((id) => id !== userId)
                )

                // Add parent author to notifications if it's a reply
                if (parentAuthorId && parentAuthorId !== userId) {
                    notificationRecipients.add(parentAuthorId)
                }

                if (notificationRecipients.size > 0) {
                    const commentType = input.parentId ? 'reply' : 'comment'
                    const actionText = input.parentId
                        ? 'replied to a comment'
                        : 'commented'

                    await ctx.db.insert(notifications).values(
                        Array.from(notificationRecipients).map(
                            (recipientId) => ({
                                userId: recipientId,
                                pageId: input.fileId,
                                content: `${currentUser.name} ${actionText} on "${file.name}": "${input.content.slice(0, 100)}"`,
                                type: commentType,
                                read: false,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            })
                        )
                    )
                }
            }

            return comment
        }),

    // Update a comment (only by the author)
    updateComment: protectedProcedure
        .input(
            z.object({
                id: z.number().int().positive(),
                content: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if comment exists and user is the author
            const existingComment = await ctx.db.query.comments.findFirst({
                where: eq(comments.id, input.id),
                columns: { userId: true, fileId: true },
            })

            if (!existingComment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Comment not found',
                })
            }

            if (existingComment.userId !== userId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You can only edit your own comments',
                })
            }

            // Update the comment
            const [updatedComment] = await ctx.db
                .update(comments)
                .set({
                    content: input.content,
                    updatedAt: new Date(),
                })
                .where(eq(comments.id, input.id))
                .returning()

            return updatedComment
        }),

    // Delete a comment (only by the author or users with edit permission on the file)
    deleteComment: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if comment exists
            const existingComment = await ctx.db.query.comments.findFirst({
                where: eq(comments.id, input.id),
                columns: { userId: true, fileId: true },
            })

            if (!existingComment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Comment not found',
                })
            }

            // Check if user is the author OR has edit permission on the file
            const isAuthor = existingComment.userId === userId
            const canEdit = await hasPermission(
                userId,
                existingComment.fileId,
                'edit'
            )

            if (!isAuthor && !canEdit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'You can only delete your own comments or need edit permission on the file',
                })
            }

            // Delete the comment (cascade will handle replies)
            await ctx.db.delete(comments).where(eq(comments.id, input.id))

            return { success: true }
        }),

    // Resolve/unresolve a comment (requires edit permission)
    toggleResolved: protectedProcedure
        .input(
            z.object({
                id: z.number().int().positive(),
                isResolved: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if comment exists
            const existingComment = await ctx.db.query.comments.findFirst({
                where: eq(comments.id, input.id),
                columns: { fileId: true },
            })

            if (!existingComment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Comment not found',
                })
            }

            // Check if user has edit permission on the file
            const canEdit = await hasPermission(
                userId,
                existingComment.fileId,
                'edit'
            )
            if (!canEdit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You need edit permission to resolve comments',
                })
            }

            // Update the resolved status
            const [updatedComment] = await ctx.db
                .update(comments)
                .set({
                    isResolved: input.isResolved,
                    updatedAt: new Date(),
                })
                .where(eq(comments.id, input.id))
                .returning()

            return updatedComment
        }),

    // Get comment statistics for a file
    getFileCommentStats: protectedProcedure
        .input(z.object({ fileId: z.number().int().positive() }))
        .query(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user has at least view permission on this file
            const canView = await hasPermission(userId, input.fileId, 'view')
            if (!canView) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to view this file',
                })
            }

            const stats = await ctx.db
                .select({
                    isResolved: comments.isResolved,
                    count: sql<number>`count(*)`,
                })
                .from(comments)
                .where(eq(comments.fileId, input.fileId))
                .groupBy(comments.isResolved)

            const result = {
                total: 0,
                resolved: 0,
                unresolved: 0,
            }

            stats.forEach(({ isResolved, count }) => {
                result.total += count
                if (isResolved) {
                    result.resolved += count
                } else {
                    result.unresolved += count
                }
            })

            return result
        }),
})
