import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    deleteLocalEvent,
    getLocalEventGoogleId,
    parseCalendarEventId,
} from '~/server/calendar'
import {
    getGoogleCalendarClient,
    GoogleCalendarConnectionError,
} from '~/server/google-calendar'

const deleteEventSchema = z.object({
    id: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = deleteEventSchema.parse(await req.json())
        const parsed = parseCalendarEventId(body.id)

        if (!parsed) {
            return NextResponse.json(
                { error: 'Invalid event id' },
                { status: 400 }
            )
        }

        if (parsed.source === 'google') {
            const calendar = await getGoogleCalendarClient(auth.userId)
            await calendar.events.delete({
                calendarId: 'primary',
                eventId: parsed.googleEventId,
            })

            return NextResponse.json({ success: true })
        }

        // A local event that was pushed to Google should disappear from both
        // places, but a Google-side failure must not block the local delete.
        const googleEventId = await getLocalEventGoogleId(
            auth.userId,
            parsed.localId
        )

        const deleted = await deleteLocalEvent(auth.userId, parsed.localId)

        if (!deleted) {
            return NextResponse.json(
                { error: 'Event not found' },
                { status: 404 }
            )
        }

        if (googleEventId) {
            try {
                const calendar = await getGoogleCalendarClient(auth.userId)
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: googleEventId,
                })
            } catch (error) {
                console.error(
                    'Local event deleted but Google copy remains:',
                    error
                )
                return NextResponse.json({
                    success: true,
                    googleDeleteFailed: true,
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request payload', issues: error.flatten() },
                { status: 400 }
            )
        }

        if (error instanceof GoogleCalendarConnectionError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status }
            )
        }

        console.error('Calendar delete error:', error)
        return NextResponse.json(
            { error: 'Failed to delete event' },
            { status: 500 }
        )
    }
}
