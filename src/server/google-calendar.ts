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

    return oauth2Client
}

export async function getGoogleCalendarClient(userId: string) {
    return google.calendar({
        version: 'v3',
        auth: await createUserGoogleOAuth2Client(userId),
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
