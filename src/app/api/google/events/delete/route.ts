import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    getGoogleCalendarClient,
    GoogleCalendarConnectionError,
} from '~/server/google-calendar'

const deleteEventSchema = z.object({
    id: z.string().trim().min(1).optional(),
    eventId: z.string().trim().min(1).optional(),
})

export async function POST(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = deleteEventSchema.parse(await req.json())
        const eventId = body.id ?? body.eventId

        if (!eventId) {
            return NextResponse.json(
                { error: 'Missing event id' },
                { status: 400 }
            )
        }

        const calendar = await getGoogleCalendarClient(auth.userId)

        await calendar.events.delete({
            calendarId: 'primary',
            eventId,
        })

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

        console.error('Google Calendar delete error:', error)
        return NextResponse.json(
            { error: 'Failed to delete event' },
            { status: 500 }
        )
    }
}
