import { google, type calendar_v3 } from 'googleapis'
import { eq } from 'drizzle-orm'

import { env } from '~/env'
import { db } from '~/server/db'
import { googleCalendarConnections } from '~/server/db/schema'

export const GOOGLE_CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'openid',
    'email',
    'profile',
] as const

export class GoogleCalendarConnectionError extends Error {
    readonly status: number
    readonly code: string

    constructor(message: string, status = 400, code = 'GOOGLE_CONNECTION_ERROR') {
        super(message)
        this.name = 'GoogleCalendarConnectionError'
        this.status = status
        this.code = code
    }
}

export function createGoogleOAuth2Client() {
    return new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
    )
}

export async function getGoogleCalendarConnection(userId: string) {
    return db.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.userId, userId),
    })
}

type UpsertGoogleCalendarConnectionInput = {
    userId: string
    googleAccountId: string | null
    googleEmail: string | null
    accessToken: string | null
    refreshToken: string
    scope: string | null
    tokenType: string | null
    expiryDate: Date | null
}

export async function upsertGoogleCalendarConnection(
    input: UpsertGoogleCalendarConnectionInput
) {
    const now = new Date()

    await db
        .insert(googleCalendarConnections)
        .values({
            ...input,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: googleCalendarConnections.userId,
            set: {
                googleAccountId: input.googleAccountId,
                googleEmail: input.googleEmail,
                accessToken: input.accessToken,
                refreshToken: input.refreshToken,
                scope: input.scope,
                tokenType: input.tokenType,
                expiryDate: input.expiryDate,
                updatedAt: now,
            },
        })
}

async function persistOAuthCredentials(
    connection: NonNullable<Awaited<ReturnType<typeof getGoogleCalendarConnection>>>,
    credentials: {
        access_token?: string | null
        refresh_token?: string | null
        scope?: string | null
        token_type?: string | null
        expiry_date?: number | null
    }
) {
    const nextAccessToken = credentials.access_token ?? connection.accessToken ?? null
    const nextRefreshToken =
        credentials.refresh_token ?? connection.refreshToken ?? null
    const nextScope = credentials.scope ?? connection.scope ?? null
    const nextTokenType = credentials.token_type ?? connection.tokenType ?? null
    const nextExpiryDate =
        typeof credentials.expiry_date === 'number'
            ? new Date(credentials.expiry_date)
            : connection.expiryDate ?? null

    if (!nextRefreshToken) {
        return
    }

    const hasChanged =
        nextAccessToken !== (connection.accessToken ?? null) ||
        nextRefreshToken !== connection.refreshToken ||
        nextScope !== (connection.scope ?? null) ||
        nextTokenType !== (connection.tokenType ?? null) ||
        nextExpiryDate?.getTime() !== connection.expiryDate?.getTime()

    if (!hasChanged) {
        return
    }

    await upsertGoogleCalendarConnection({
        userId: connection.userId,
        googleAccountId: connection.googleAccountId,
        googleEmail: connection.googleEmail,
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        scope: nextScope,
        tokenType: nextTokenType,
        expiryDate: nextExpiryDate,
    })
}

export async function createUserGoogleOAuth2Client(userId: string) {
    const connection = await getGoogleCalendarConnection(userId)

    if (!connection?.refreshToken) {
        throw new GoogleCalendarConnectionError(
            'Google Calendar is not connected for this user.',
            409,
            'GOOGLE_NOT_CONNECTED'
        )
    }

    const oauth2Client = createGoogleOAuth2Client()

    oauth2Client.setCredentials({
        access_token: connection.accessToken ?? undefined,
        refresh_token: connection.refreshToken,
        scope: connection.scope ?? undefined,
        token_type: connection.tokenType ?? undefined,
        expiry_date: connection.expiryDate?.getTime(),
    })

    oauth2Client.on('tokens', (tokens) => {
        void persistOAuthCredentials(connection, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope,
            token_type: tokens.token_type,
            expiry_date: tokens.expiry_date,
        })
    })

    await oauth2Client.getAccessToken()
    await persistOAuthCredentials(connection, oauth2Client.credentials)

    return oauth2Client
}

export async function getGoogleCalendarClient(userId: string) {
    return google.calendar({
        version: 'v3',
        auth: await createUserGoogleOAuth2Client(userId),
    })
}

type FetchGoogleCalendarEventsInput = {
    userId: string
    timeMin: string
    timeMax: string
}

export async function fetchGoogleCalendarEvents(
    input: FetchGoogleCalendarEventsInput
) {
    const calendar = await getGoogleCalendarClient(input.userId)
    const events = new Map<string, ReturnType<typeof mapGoogleCalendarEvent>>()
    let pageToken: string | undefined

    do {
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: input.timeMin,
            timeMax: input.timeMax,
            maxResults: 2500,
            singleEvents: true,
            showDeleted: false,
            orderBy: 'startTime',
            pageToken,
        })

        for (const item of response.data.items ?? []) {
            const mapped = mapGoogleCalendarEvent(item)
            if (!mapped.id || !mapped.start) {
                continue
            }

            events.set(mapped.id, mapped)
        }

        pageToken = response.data.nextPageToken ?? undefined
    } while (pageToken)

    return Array.from(events.values()).sort((a, b) => {
        const aTime = new Date(a.start ?? 0).getTime()
        const bTime = new Date(b.start ?? 0).getTime()
        return aTime - bTime
    })
}

export function mapGoogleCalendarEvent(event: calendar_v3.Schema$Event) {
    return {
        id: event.id ?? '',
        title: event.summary ?? '',
        description: event.description ?? '',
        location: event.location ?? '',
        start: event.start?.dateTime ?? event.start?.date ?? null,
        end: event.end?.dateTime ?? event.end?.date ?? null,
        htmlLink: event.htmlLink ?? undefined,
    }
}

export function getGoogleOAuthErrorDetail(error: unknown) {
    if (error instanceof Error) {
        return error.message
    }

    return 'Unknown Google OAuth error'
}
