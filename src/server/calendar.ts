import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'

import { db } from '~/server/db'
import { calendarEvents, users } from '~/server/db/schema'
import {
    getGoogleCalendarClient,
    getGoogleCalendarConnection,
} from '~/server/google-calendar'

export const CALENDAR_TIME_ZONE = 'Africa/Johannesburg'

/**
 * A calendar event as the client sees it, whether it came from our database or
 * from Google. `source` tells the UI which delete path to use.
 */
export type CalendarEvent = {
    id: string
    title: string
    description: string
    location: string
    start: string
    end: string
    source: 'local' | 'google'
    htmlLink?: string
    /** Set on local events that have already been copied into Google. */
    googleEventId?: string
}

/**
 * The REST calendar routes authenticate with Clerk directly rather than going
 * through tRPC's protectedProcedure, so the users row that calendarEvents.userId
 * references may not exist yet. Mirror the same upsert here.
 */
export async function ensureUserExists(userId: string) {
    const existing = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })

    if (existing) {
        return
    }

    const { currentUser } = await import('@clerk/nextjs/server')
    const clerkUser = await currentUser()

    if (!clerkUser) {
        return
    }

    await db
        .insert(users)
        .values({
            id: userId,
            name:
                clerkUser.fullName ??
                clerkUser.firstName ??
                clerkUser.username ??
                'Unknown User',
            email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
            role: 'unverified',
        })
        .onConflictDoNothing()
}

function mapLocalEvent(
    row: typeof calendarEvents.$inferSelect
): CalendarEvent {
    return {
        id: `local:${row.id}`,
        title: row.title,
        description: row.description,
        location: row.location,
        start: row.startAt.toISOString(),
        end: row.endAt.toISOString(),
        source: 'local',
        googleEventId: row.googleEventId ?? undefined,
    }
}

type ListLocalEventsInput = {
    userId: string
    timeMin: Date
    timeMax: Date
}

export async function listLocalEvents(
    input: ListLocalEventsInput
): Promise<CalendarEvent[]> {
    const rows = await db.query.calendarEvents.findMany({
        where: and(
            eq(calendarEvents.userId, input.userId),
            gte(calendarEvents.startAt, input.timeMin),
            lte(calendarEvents.startAt, input.timeMax)
        ),
        orderBy: [asc(calendarEvents.startAt)],
    })

    return rows.map(mapLocalEvent)
}

type CreateLocalEventInput = {
    userId: string
    title: string
    description: string
    location: string
    startAt: Date
    endAt: Date
}

export async function createLocalEvent(
    input: CreateLocalEventInput
): Promise<CalendarEvent> {
    await ensureUserExists(input.userId)

    const [row] = await db
        .insert(calendarEvents)
        .values({
            userId: input.userId,
            title: input.title,
            description: input.description,
            location: input.location,
            startAt: input.startAt,
            endAt: input.endAt,
        })
        .returning()

    if (!row) {
        throw new Error('Failed to create calendar event')
    }

    return mapLocalEvent(row)
}

export async function deleteLocalEvent(userId: string, eventId: number) {
    const deleted = await db
        .delete(calendarEvents)
        .where(
            and(
                eq(calendarEvents.id, eventId),
                eq(calendarEvents.userId, userId)
            )
        )
        .returning({ id: calendarEvents.id })

    return deleted.length > 0
}

/** Local events that have never been copied into Google. */
export async function countUnsyncedLocalEvents(userId: string) {
    const rows = await db.query.calendarEvents.findMany({
        where: and(
            eq(calendarEvents.userId, userId),
            isNull(calendarEvents.googleEventId)
        ),
        columns: { id: true },
    })

    return rows.length
}

/**
 * Copies one already-persisted local event into Google and records the returned
 * Google id. Returns the Google event id, or null if Google declined to give one.
 */
async function copyEventToGoogle(
    calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>>,
    row: typeof calendarEvents.$inferSelect
) {
    const inserted = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: row.title,
            description: row.description,
            location: row.location,
            start: {
                dateTime: row.startAt.toISOString(),
                timeZone: CALENDAR_TIME_ZONE,
            },
            end: {
                dateTime: row.endAt.toISOString(),
                timeZone: CALENDAR_TIME_ZONE,
            },
        },
    })

    if (!inserted.data.id) {
        return null
    }

    await db
        .update(calendarEvents)
        .set({ googleEventId: inserted.data.id, updatedAt: new Date() })
        .where(eq(calendarEvents.id, row.id))

    return {
        googleEventId: inserted.data.id,
        htmlLink: inserted.data.htmlLink ?? undefined,
    }
}

/** Pushes a single local event to Google, by the id returned from createLocalEvent. */
export async function pushLocalEventToGoogle(userId: string, localId: number) {
    const row = await db.query.calendarEvents.findFirst({
        where: and(
            eq(calendarEvents.id, localId),
            eq(calendarEvents.userId, userId)
        ),
    })

    if (!row || row.googleEventId) {
        return null
    }

    const calendar = await getGoogleCalendarClient(userId)
    return copyEventToGoogle(calendar, row)
}

export type PushLocalEventsResult = {
    pushed: number
    failed: number
}

/**
 * Copies every local event that has not yet been pushed into the user's Google
 * Calendar, recording the resulting Google id so a later push is a no-op.
 * Failures are counted rather than thrown so one bad event cannot strand the rest.
 */
export async function pushLocalEventsToGoogle(
    userId: string
): Promise<PushLocalEventsResult> {
    const pending = await db.query.calendarEvents.findMany({
        where: and(
            eq(calendarEvents.userId, userId),
            isNull(calendarEvents.googleEventId)
        ),
        orderBy: [asc(calendarEvents.startAt)],
    })

    if (pending.length === 0) {
        return { pushed: 0, failed: 0 }
    }

    const calendar = await getGoogleCalendarClient(userId)
    let pushed = 0
    let failed = 0

    for (const row of pending) {
        try {
            const result = await copyEventToGoogle(calendar, row)
            if (result) {
                pushed += 1
            } else {
                failed += 1
            }
        } catch (error) {
            console.error(`Failed to push calendar event ${row.id}:`, error)
            failed += 1
        }
    }

    return { pushed, failed }
}

/**
 * Splits the prefixed ids the client works with (`local:12`, `google:abc`) back
 * into something the server can act on.
 */
export function parseCalendarEventId(
    id: string
):
    | { source: 'local'; localId: number }
    | { source: 'google'; googleEventId: string }
    | null {
    if (id.startsWith('local:')) {
        const localId = Number(id.slice('local:'.length))
        return Number.isInteger(localId) && localId > 0
            ? { source: 'local', localId }
            : null
    }

    if (id.startsWith('google:')) {
        const googleEventId = id.slice('google:'.length)
        return googleEventId ? { source: 'google', googleEventId } : null
    }

    return null
}

/** The Google-side id of a local event, if it has been pushed. */
export async function getLocalEventGoogleId(userId: string, localId: number) {
    const row = await db.query.calendarEvents.findFirst({
        where: and(
            eq(calendarEvents.id, localId),
            eq(calendarEvents.userId, userId)
        ),
        columns: { googleEventId: true },
    })

    return row?.googleEventId ?? null
}

export async function isGoogleConnected(userId: string) {
    const connection = await getGoogleCalendarConnection(userId)
    return Boolean(connection?.refreshToken)
}
