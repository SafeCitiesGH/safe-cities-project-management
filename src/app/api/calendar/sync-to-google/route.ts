import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    countUnsyncedLocalEvents,
    isGoogleConnected,
    pushLocalEventsToGoogle,
} from '~/server/calendar'
import { GoogleCalendarConnectionError } from '~/server/google-calendar'

/** How many local events have never been copied to Google. Drives the prompt. */
export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pending = await countUnsyncedLocalEvents(auth.userId)

    return NextResponse.json({
        pending,
        googleConnected: await isGoogleConnected(auth.userId),
    })
}

/** Copies all not-yet-pushed local events into the user's Google Calendar. */
export async function POST(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const result = await pushLocalEventsToGoogle(auth.userId)
        return NextResponse.json(result)
    } catch (error) {
        if (error instanceof GoogleCalendarConnectionError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status }
            )
        }

        console.error('Calendar sync-to-google error:', error)
        return NextResponse.json(
            { error: 'Failed to add events to Google Calendar' },
            { status: 500 }
        )
    }
}
