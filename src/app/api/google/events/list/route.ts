import { NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    getGoogleCalendarClient,
    GoogleCalendarConnectionError,
    mapGoogleCalendarEvent,
} from '~/server/google-calendar'

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const calendar = await getGoogleCalendarClient(auth.userId)
        const now = new Date().toISOString()

        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now,
            maxResults: 2500,
            singleEvents: true,
            orderBy: 'startTime',
        })

        return NextResponse.json(
            (res.data.items ?? []).map((item) => mapGoogleCalendarEvent(item))
        )
    } catch (error) {
        if (error instanceof GoogleCalendarConnectionError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status }
            )
        }

        console.error('Google Calendar list error:', error)
        return NextResponse.json(
            { error: 'Failed to list events' },
            { status: 500 }
        )
    }
}
