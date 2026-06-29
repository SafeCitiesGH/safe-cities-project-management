import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { clerkClient, currentUser } from '@clerk/nextjs/server'

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
    adminProcedure,
} from '~/server/api/trpc'
import { ROLES, roleSchema, rolesEnum, users } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'

export const userRouter = createTRPCRouter({
    // Public route that anyone can access
    getPublicUsers: publicProcedure.query(async () => {
        return {
            message: 'This is public data that anyone can access',
            users: [
                { id: 1, name: 'Public User 1' },
                { id: 2, name: 'Public User 2' },
            ],
        }
    }),

    // Get the current user's profile
    getProfile: protectedProcedure.query(async ({ ctx }) => {
        const { userId } = ctx.auth

        // Find the user in the database
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, userId),
        })

        if (!user) {
            // If the user doesn't exist in our database yet, return just the auth info
            return {
                id: userId,
                email: 'User not found in database',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        }

        return user
    }),

    // Protected route that requires authentication
    getProtectedUserData: protectedProcedure.query(async ({ ctx }) => {
        // ctx.auth is guaranteed to exist here since we're using protectedProcedure
        return {
            message: 'You are authenticated!',
            userId: ctx.auth.userId,
            // You can use ctx.auth.userId to fetch user-specific data
        }
    }),

    // Protected mutation that requires authentication
    updateUserProfile: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).optional(),
                email: z.string().email().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { userId } = ctx.auth

            // Check if user exists
            const existingUser = await ctx.db.query.users.findFirst({
                where: eq(users.id, userId),
            })

            if (existingUser) {
                // Update existing user
                await ctx.db
                    .update(users)
                    .set({
                        ...(input.name && { name: input.name }),
                        ...(input.email && { email: input.email }),
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, userId))

                return {
                    success: true,
                    message: 'Profile updated successfully',
                    operation: 'updated',
                }
            } else {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User not found',
                })
            }
        }),

    // For admin: get all users
    getAllUsers: protectedProcedure.query(async ({ ctx }) => {
        const allUsers = await ctx.db.query.users.findMany({
            columns: {
                name: true,
                id: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: (users, { desc }) => [desc(users.createdAt)],
        })

        const client = await clerkClient()

        const usersWithImages = await Promise.all(
            allUsers.map(async (user) => {
                try {
                    const clerkUser = await client.users.getUser(user.id)
                    return {
                        ...user,
                        imageUrl: clerkUser.imageUrl ?? null,
                    }
                } catch (error) {
                    console.error(
                        `Failed to load Clerk image for user ${user.id}:`,
                        error
                    )
                    return {
                        ...user,
                        imageUrl: null,
                    }
                }
            })
        )

        return usersWithImages
    }),

    // Admin-only: changing a user's role is a privilege-escalation surface
    updateUserRole: adminProcedure
        .input(
            z.object({
                id: z.string(),
                role: roleSchema,
            })
        )
        .mutation(async ({ ctx, input }) => {
            try {
                // Update user role in database
                const result = await ctx.db
                    .update(users)
                    .set({
                        role: input.role,
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, input.id))
                    .returning()

                if (result.length === 0) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'User not found',
                    })
                }

                // Update Clerk metadata if role is not unverified
                if (input.role !== 'unverified') {
                    const client = await clerkClient()
                    const res = await client.users.updateUserMetadata(
                        input.id,
                        {
                            publicMetadata: {
                                onboardingComplete: true,
                                role: input.role,
                            },
                        }
                    )
                    console.log('Clerk metadata updated:', res.publicMetadata)
                }

                return {
                    success: true,
                    message: 'User role updated successfully',
                    user: result[0],
                }
            } catch (err) {
                console.error('Error updating user role:', err)
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: "Couldn't update user role",
                    cause: err,
                })
            }
        }),

    // Ensure current user exists in database
    ensureCurrentUser: protectedProcedure.mutation(async ({ ctx }) => {
        const { userId } = ctx.auth

        // Check if user already exists
        const existingUser = await ctx.db.query.users.findFirst({
            where: eq(users.id, userId),
        })

        if (existingUser) {
            return existingUser
        }

        // Get user details from Clerk
        const clerkUser = await currentUser()

        if (!clerkUser) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'User not found in Clerk',
            })
        }

        // Create user in our database
        const [newUser] = await ctx.db
            .insert(users)
            .values({
                id: userId,
                name:
                    clerkUser.fullName || clerkUser.firstName || 'Unknown User',
                email: clerkUser.emailAddresses[0]?.emailAddress || '',
                role: 'unverified',
            })
            .returning()

        return newUser
    }),

    // Admin-only: deleting a user is destructive and must be restricted
    deleteUser: adminProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                // First, get user info for response
                const userToDelete = await ctx.db.query.users.findFirst({
                    where: eq(users.id, input.userId),
                    columns: { name: true, email: true },
                })

                if (!userToDelete) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'User not found in database',
                    })
                }

                // Delete from Clerk first
                const client = await clerkClient()
                await client.users.deleteUser(input.userId)

                // Delete from database (cascade will handle related data)
                await ctx.db.delete(users).where(eq(users.id, input.userId))

                return {
                    success: true,
                    message: `User ${userToDelete.name || userToDelete.email} deleted successfully`,
                    deletedUser: userToDelete,
                }
            } catch (err) {
                console.error('Error deleting user:', err)

                // Check if it's a Clerk error
                if (err && typeof err === 'object' && 'status' in err) {
                    if (err.status === 404) {
                        // User doesn't exist in Clerk, just delete from database
                        await ctx.db
                            .delete(users)
                            .where(eq(users.id, input.userId))
                        return {
                            success: true,
                            message:
                                'User deleted from database (was not found in Clerk)',
                        }
                    }
                }

                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to delete user',
                    cause: err,
                })
            }
        }),
})
