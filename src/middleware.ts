import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from 'src/components/supabase-utils/middleware'

const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isApiRoute = createRouteMatcher(['/api(.*)'])
// Public form submission links — shareable with people who have no account.
// The form itself still gates access (published/accepting responses).
const isPublicFormRoute = createRouteMatcher(['/forms/:id(\\d+)/submit'])
// About page, privacy policy and terms. These MUST stay reachable without
// signing in: Google requires a publicly accessible home page, privacy policy
// and terms of service before an OAuth app using sensitive scopes (we request
// Calendar) can be published. Behind a sign-in redirect they do not qualify.
// '/' is deliberately NOT in this list — it still sends everyone to sign in,
// exactly as before. /about is the home page URL given to Google instead.
const isPublicMarketingRoute = createRouteMatcher([
    '/about',
    '/privacy',
    '/terms',
])
const isSupabaseRoute = createRouteMatcher([
    '/pages/:id(\\d+)',
    '/sheets/:id(\\d+)',
    '/forms/:id(\\d+)',
    '/uploads/:id(\\d+)',
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
    if (
        isApiRoute(req) ||
        isPublicFormRoute(req) ||
        isPublicMarketingRoute(req)
    ) {
        return NextResponse.next()
    }

    const { userId, sessionClaims, redirectToSignIn } = await auth()

    if (!userId) {
        return redirectToSignIn()
    }

    // A user is "verified" once an admin has granted them a real role. We treat
    // EITHER signal as verified (role or the onboardingComplete flag) so a
    // verified user is never wrongly stranded on the review screen if one claim
    // lags in the session token. Brand-new signups (empty metadata) and anyone
    // demoted to 'unverified' have neither, so they land on /onboarding.
    const role = sessionClaims?.metadata?.role
    const onboardingComplete = sessionClaims?.metadata?.onboardingComplete
    const isVerified =
        role === 'user' || role === 'admin' || onboardingComplete === true

    if (!isVerified && !isOnboardingRoute(req)) {
        const onboardingUrl = new URL('/onboarding', req.url)
        return NextResponse.redirect(onboardingUrl)
    }

    if (isVerified && isOnboardingRoute(req)) {
        const homeUrl = new URL('/', req.url)
        return NextResponse.redirect(homeUrl)
    }

    // NOTE: the /users admin check is intentionally NOT enforced here. The
    // session token's role copy can lag behind the database (and differs across
    // Clerk environments), which would wrongly bounce a real admin. The /users
    // page enforces admin access itself using the authoritative database role,
    // and every sensitive action uses adminProcedure (DB-checked) server-side.

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
