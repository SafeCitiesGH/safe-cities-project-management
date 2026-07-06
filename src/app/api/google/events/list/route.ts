import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    fetchGoogleCalendarEvents,
    GoogleCalendarConnectionError,
} from '~/server/google-calendar'

const DEFAULT_PAST_MONTHS = 12
const DEFAULT_FUTURE_MONTHS = 12

function buildDefaultTimeRange() {
    const now = new Date()
    const timeMin = new Date(now)
    const timeMax = new Date(now)

    timeMin.setMonth(timeMin.getMonth() - DEFAULT_PAST_MONTHS)
    timeMax.setMonth(timeMax.getMonth() + DEFAULT_FUTURE_MONTHS)

    return {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
    }
}

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)
    const defaultRange = buildDefaultTimeRange()

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const timeMin =
            req.nextUrl.searchParams.get('timeMin') ??
            defaultRange.timeMin
        const timeMax =
            req.nextUrl.searchParams.get('timeMax') ??
            defaultRange.timeMax

        const events = await fetchGoogleCalendarEvents({
            userId: auth.userId,
            timeMin,
            timeMax,
        })

        return NextResponse.json(events)
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
