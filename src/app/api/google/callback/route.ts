import { currentUser } from '@clerk/nextjs/server'
import { google } from 'googleapis'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import {
    createGoogleOAuth2Client,
    getGoogleCalendarConnection,
    getGoogleOAuthErrorDetail,
    upsertGoogleCalendarConnection,
} from '~/server/google-calendar'

function buildRedirectUrl(req: NextRequest, status: string, detail?: string) {
    const redirectPath =
        req.cookies.get('google_oauth_redirect')?.value ?? '/google-calendar'
    const url = new URL(redirectPath, req.url)

    url.searchParams.set('google', status)
    if (detail) {
        url.searchParams.set('detail', detail)
    }

    return url
}

function clearOAuthCookies(response: NextResponse) {
    response.cookies.delete('google_oauth_state')
    response.cookies.delete('google_oauth_redirect')
    return response
}

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const state = req.nextUrl.searchParams.get('state')
    const code = req.nextUrl.searchParams.get('code')
    const storedState = req.cookies.get('google_oauth_state')?.value

    if (!code) {
        return clearOAuthCookies(
            NextResponse.redirect(buildRedirectUrl(req, 'error', 'missing_code'))
        )
    }

    if (!state || !storedState || state !== storedState) {
        return clearOAuthCookies(
            NextResponse.redirect(
                buildRedirectUrl(req, 'error', 'invalid_oauth_state')
            )
        )
    }

    try {
        const oauth2Client = createGoogleOAuth2Client()
        const existingConnection = await getGoogleCalendarConnection(auth.userId)
        const clerkUser = await currentUser()

        if (clerkUser?.id && clerkUser.emailAddresses[0]?.emailAddress) {
            await db
                .insert(users)
                .values({
                    id: clerkUser.id,
                    email: clerkUser.emailAddresses[0].emailAddress,
                    name:
                        clerkUser.fullName ??
                        clerkUser.firstName ??
                        clerkUser.username ??
                        'Unknown User',
                })
                .onConflictDoNothing()
        }

        const { tokens } = await oauth2Client.getToken(code)
        const refreshToken =
            tokens.refresh_token ?? existingConnection?.refreshToken ?? null

        if (!refreshToken) {
            throw new Error('Google did not return a refresh token.')
        }

        oauth2Client.setCredentials(tokens)

        const oauth2 = google.oauth2({
            version: 'v2',
            auth: oauth2Client,
        })
        const { data: profile } = await oauth2.userinfo.get()

        await upsertGoogleCalendarConnection({
            userId: auth.userId,
            googleAccountId: profile.id ?? null,
            googleEmail: profile.email ?? null,
            accessToken: tokens.access_token ?? null,
            refreshToken,
            scope: tokens.scope ?? null,
            tokenType: tokens.token_type ?? null,
            expiryDate: tokens.expiry_date
                ? new Date(tokens.expiry_date)
                : null,
        })

        return clearOAuthCookies(
            NextResponse.redirect(
                buildRedirectUrl(
                    req,
                    existingConnection ? 'reconnected' : 'connected'
                )
            )
        )
    } catch (error) {
        console.error('Google OAuth callback error:', error)
        return clearOAuthCookies(
            NextResponse.redirect(
                buildRedirectUrl(
                    req,
                    'error',
                    encodeURIComponent(getGoogleOAuthErrorDetail(error))
                )
            )
        )
    }
}
