import { google } from "googleapis"
import { getAuth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { db } from "~/server/db"
import { googleCredentials } from "~/server/db/schema"
import type { NextRequest } from "next/server"

const createOAuthClient = () =>
    new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    )

export const createGoogleOAuthClient = createOAuthClient

export type GoogleCalendarClient = {
    oauth2Client: any
    calendarId: string
}

export const getCurrentUserId = (req: NextRequest) => {
    const auth = getAuth(req)

    if (!auth.userId) {
        throw new Error("Authentication required")
    }

    return auth.userId
}

export const saveUserGoogleCredentials = async (
    userId: string,
    tokens: {
        refresh_token?: string
        access_token?: string
        scope?: string
        token_type?: string
        expiry_date?: number | string
    }
) => {
    const current = await db.query.googleCredentials.findFirst({
        where: eq(googleCredentials.userId, userId),
    })

    const refreshToken = tokens.refresh_token ?? current?.refreshToken
    const accessToken = tokens.access_token ?? current?.accessToken ?? null
    const scope = tokens.scope ?? current?.scope ?? ""
    const tokenType = tokens.token_type ?? current?.tokenType ?? ""
    const expiryDate =
        tokens.expiry_date !== undefined && tokens.expiry_date !== null
            ? BigInt(Number(tokens.expiry_date))
            : current?.expiryDate ?? null

    if (!refreshToken) {
        throw new Error("Unable to save Google credentials without a refresh token")
    }

    const now = new Date()

    if (current) {
        await db
            .update(googleCredentials)
            .set({
                refreshToken,
                accessToken,
                scope,
                tokenType,
                expiryDate,
                updatedAt: now,
            })
            .where(eq(googleCredentials.userId, userId))

        return
    }

    await db.insert(googleCredentials).values({
        userId,
        refreshToken,
        accessToken,
        scope,
        tokenType,
        expiryDate,
        calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        createdAt: now,
        updatedAt: now,
    })
}

export const getGoogleCalendarClient = async (
    req: NextRequest
): Promise<GoogleCalendarClient> => {
    const userId = getCurrentUserId(req)
    const credential = await db.query.googleCredentials.findFirst({
        where: eq(googleCredentials.userId, userId),
    })

    if (credential?.refreshToken) {
        const oauth2Client = createOAuthClient()
        oauth2Client.setCredentials({
            refresh_token: credential.refreshToken,
            access_token: credential.accessToken ?? undefined,
            scope: credential.scope || undefined,
            token_type: credential.tokenType || undefined,
            expiry_date: credential.expiryDate ? Number(credential.expiryDate) : undefined,
        })

        return {
            oauth2Client,
            calendarId: credential.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary",
        }
    }

    if (process.env.GOOGLE_REFRESH_TOKEN) {
        const oauth2Client = createOAuthClient()
        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        })

        return {
            oauth2Client,
            calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        }
    }

    throw new Error("Google Calendar account not connected")
}
