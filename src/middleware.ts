import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from 'src/components/supabase-utils/middleware'

const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isApiRoute = createRouteMatcher(['/api(.*)'])
const isSupabaseRoute = createRouteMatcher([
    '/pages/:id(\\d+)',
    '/sheets/:id(\\d+)',
    '/forms/:id(\\d+)',
    '/uploads/:id(\\d+)',
])
const isAdminRoute = createRouteMatcher(['/users'])

export default clerkMiddleware(async (auth, req: NextRequest) => {
    if (isApiRoute(req)) {
        return NextResponse.next()
    }

    const { userId, sessionClaims, redirectToSignIn } = await auth()

    if (!userId) {
        return redirectToSignIn()
    }

    // A user is "verified" once an admin has granted them a real role.
    // Brand-new signups (empty metadata) and anyone demoted back to
    // 'unverified' are NOT verified and are parked on the review screen at
    // /onboarding. This keys off the actual role, not a separate
    // onboardingComplete flag, so the two can't drift apart.
    const role = sessionClaims?.metadata?.role
    const isVerified = role === 'user' || role === 'admin'

    if (!isVerified && !isOnboardingRoute(req)) {
        const onboardingUrl = new URL('/onboarding', req.url)
        return NextResponse.redirect(onboardingUrl)
    }

    if (isVerified && isOnboardingRoute(req)) {
        const homeUrl = new URL('/', req.url)
        return NextResponse.redirect(homeUrl)
    }

    // Check admin access for admin-only routes
    if (isAdminRoute(req)) {
        if (role !== 'admin') {
            const dashboardUrl = new URL('/dashboard', req.url)
            return NextResponse.redirect(dashboardUrl)
        }
    }

    // Only sync Supabase session for pages, sheets, forms, and upload routes
    if (isSupabaseRoute(req)) {
        return await updateSession(req)
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        // Keep Clerk auth and onboarding everywhere except static assets
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/api/(.*)',
    ],
}
