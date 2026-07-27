import { randomUUID } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    createGoogleOAuth2Client,
    GOOGLE_CALENDAR_SCOPES,
} from '~/server/google-calendar'

function getSafeRedirectPath(value: string | null) {
    if (!value?.startsWith('/')) {
        return '/calendar'
    }

    return value
}

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const redirectPath = getSafeRedirectPath(
        req.nextUrl.searchParams.get('redirect')
    )
    const state = randomUUID()
    const oauth2Client = createGoogleOAuth2Client()

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: [...GOOGLE_CALENDAR_SCOPES],
        state,
    })

    const response = NextResponse.redirect(url)
    const cookieConfig = {
        httpOnly: true,
        maxAge: 60 * 10,
        path: '/',
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
    }

    response.cookies.set('google_oauth_state', state, cookieConfig)
    response.cookies.set('google_oauth_redirect', redirectPath, cookieConfig)

    return response
}
