/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'
import { eq } from 'drizzle-orm'

import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { getAuthUser } from '~/server/auth'

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
    const auth = getAuthUser(opts)

    return {
        db,
        auth,
        ...opts,
    }
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                zodError:
                    error.cause instanceof ZodError
                        ? error.cause.flatten()
                        : null,
            },
        }
    },
})

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
    const start = Date.now()

    if (t._config.isDev) {
        // artificial delay in dev
        const waitMs = Math.floor(Math.random() * 400) + 100
        await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    const result = await next()

    const end = Date.now()
    console.log(`[TRPC] ${path} took ${end - start}ms to execute`)

    return result
})

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware)

/**
 * Protected (authenticated) procedure
 *
 * This procedure ensures that the user is authenticated before running the procedure.
 * If the user is not authenticated, it throws an UNAUTHORIZED error.
 * It also ensures that the user exists in our database.
 */
export const protectedProcedure = t.procedure
    .use(timingMiddleware)
    .use(async ({ ctx, next }) => {
        if (!ctx.auth?.userId) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'You must be logged in to perform this action',
            })
        }

        // Ensure user exists in our database
        try {
            const { userId } = ctx.auth

            // Check if user already exists
            const existingUser = await ctx.db.query.users.findFirst({
                where: eq(users.id, userId),
            })

            if (!existingUser) {
                // Import currentUser dynamically to avoid SSR issues
                const { currentUser } = await import('@clerk/nextjs/server')
                const clerkUser = await currentUser()

                if (clerkUser) {
                    // Create user in our database
                    await ctx.db.insert(users).values({
                        id: userId,
                        name:
                            clerkUser.fullName ||
                            clerkUser.firstName ||
                            'Unknown User',
                        email: clerkUser.emailAddresses[0]?.emailAddress || '',
                        role: 'unverified',
                    })
                }
            }
        } catch (error) {
            console.error('Error ensuring user exists:', error)
            // Don't fail the request if user creation fails
        }

        return next({
            ctx: {
                auth: ctx.auth,
            },
        })
    })

/**
 * Admin-only procedure
 *
 * Builds on protectedProcedure and additionally verifies that the authenticated
 * user has the 'admin' role in our database. Throws FORBIDDEN otherwise.
 * Use this for operations only admins may perform (e.g. assigning users to programmes).
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    const dbUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.auth.userId),
        columns: { role: true },
    })

    if (dbUser?.role !== 'admin') {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'This action requires administrator privileges',
        })
    }

    return next({ ctx: { auth: ctx.auth } })
})
