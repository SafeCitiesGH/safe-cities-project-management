import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    createLocalEvent,
    isGoogleConnected,
    listLocalEvents,
    parseCalendarEventId,
    pushLocalEventToGoogle,
    type CalendarEvent,
} from '~/server/calendar'
import {
    fetchGoogleCalendarEvents,
    GoogleCalendarConnectionError,
} from '~/server/google-calendar'

const DEFAULT_PAST_MONTHS = 12
const DEFAULT_FUTURE_MONTHS = 12

function buildDefaultTimeRange() {
    const timeMin = new Date()
    const timeMax = new Date()

    timeMin.setMonth(timeMin.getMonth() - DEFAULT_PAST_MONTHS)
    timeMax.setMonth(timeMax.getMonth() + DEFAULT_FUTURE_MONTHS)

    return { timeMin, timeMax }
}

function parseDateParam(value: string | null, fallback: Date) {
    if (!value) {
        return fallback
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const defaults = buildDefaultTimeRange()
    const timeMin = parseDateParam(
        req.nextUrl.searchParams.get('timeMin'),
        defaults.timeMin
    )
    const timeMax = parseDateParam(
        req.nextUrl.searchParams.get('timeMax'),
        defaults.timeMax
    )

    try {
        // Local events are the baseline and never depend on Google.
        const localEvents = await listLocalEvents({
            userId: auth.userId,
            timeMin,
            timeMax,
        })

        if (!(await isGoogleConnected(auth.userId))) {
            return NextResponse.json({
                events: localEvents,
                googleConnected: false,
            })
        }

        // Events already pushed to Google would otherwise come back a second
        // time from the Google fetch below.
        const pushedGoogleIds = new Set(
            localEvents
                .map((event) => event.googleEventId)
                .filter((id): id is string => Boolean(id))
        )

        try {
            const googleEvents = await fetchGoogleCalendarEvents({
                userId: auth.userId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
            })

            const mapped: CalendarEvent[] = googleEvents
                .filter(
                    (event) => event.id && !pushedGoogleIds.has(event.id)
                )
                .map((event) => ({
                    id: `google:${event.id}`,
                    title: event.title,
                    description: event.description,
                    location: event.location,
                    start: event.start ?? '',
                    end: event.end ?? event.start ?? '',
                    source: 'google' as const,
                    htmlLink: event.htmlLink,
                }))
                .filter((event) => Boolean(event.start))

            return NextResponse.json({
                events: [...localEvents, ...mapped].sort(
                    (a, b) =>
                        new Date(a.start).getTime() - new Date(b.start).getTime()
                ),
                googleConnected: true,
            })
        } catch (error) {
            // A broken Google connection must not take the local calendar down
            // with it — serve what we have and tell the client Google is degraded.
            console.error('Google event fetch failed, serving local only:', error)

            return NextResponse.json({
                events: localEvents,
                googleConnected: true,
                googleError: true,
            })
        }
    } catch (error) {
        console.error('Calendar list error:', error)
        return NextResponse.json(
            { error: 'Failed to list events' },
            { status: 500 }
        )
    }
}

const createEventSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().optional().default(''),
    location: z.string().optional().default(''),
    start: z.string().trim().min(1),
    end: z.string().trim().min(1),
    /** Only honoured when Google is connected. */
    addToGoogle: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = createEventSchema.parse(await req.json())
        const startAt = new Date(body.start)
        const endAt = new Date(body.end)

        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
            return NextResponse.json(
                { error: 'Invalid event dates' },
                { status: 400 }
            )
        }

        if (endAt <= startAt) {
            return NextResponse.json(
                { error: 'End time must be after start time' },
                { status: 400 }
            )
        }

        const event = await createLocalEvent({
            userId: auth.userId,
            title: body.title,
            description: body.description,
            location: body.location,
            startAt,
            endAt,
        })

        if (!body.addToGoogle) {
            return NextResponse.json(event)
        }

        // The event is already saved locally at this point. If the Google copy
        // fails we still return success for the local event and flag the miss,
        // so the user never loses what they typed.
        const parsed = parseCalendarEventId(event.id)

        if (parsed?.source !== 'local') {
            return NextResponse.json(event)
        }

        try {
            const result = await pushLocalEventToGoogle(
                auth.userId,
                parsed.localId
            )

            if (!result) {
                return NextResponse.json({ ...event, googleSyncFailed: true })
            }

            return NextResponse.json({
                ...event,
                googleEventId: result.googleEventId,
                htmlLink: result.htmlLink,
            })
        } catch (error) {
            if (!(error instanceof GoogleCalendarConnectionError)) {
                console.error('Google copy of local event failed:', error)
            }

            return NextResponse.json({ ...event, googleSyncFailed: true })
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request payload', issues: error.flatten() },
                { status: 400 }
            )
        }

        console.error('Calendar create error:', error)
        return NextResponse.json(
            { error: 'Failed to create event' },
            { status: 500 }
        )
    }
}
