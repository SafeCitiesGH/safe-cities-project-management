import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import {
    getGoogleCalendarClient,
    GoogleCalendarConnectionError,
    mapGoogleCalendarEvent,
} from '~/server/google-calendar'

const createEventSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().optional().default(''),
    location: z.string().optional().default(''),
    start: z.string().trim().min(1),
    end: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = createEventSchema.parse(await req.json())
        const startDate = new Date(body.start)
        const endDate = new Date(body.end)

        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return NextResponse.json(
                { error: 'Invalid event dates' },
                { status: 400 }
            )
        }

        if (endDate <= startDate) {
            return NextResponse.json(
                { error: 'End time must be after start time' },
                { status: 400 }
            )
        }

        const calendar = await getGoogleCalendarClient(auth.userId)
        const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: body.title,
                description: body.description,
                location: body.location,
                start: {
                    dateTime: startDate.toISOString(),
                    timeZone: 'Africa/Johannesburg',
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: 'Africa/Johannesburg',
                },
            },
        })

        return NextResponse.json(mapGoogleCalendarEvent(event.data))
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

        console.error('Google Calendar create error:', error)
        return NextResponse.json(
            { error: 'Failed to create event' },
            { status: 500 }
        )
    }
}
