import { NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '~/server/auth'
import { getGoogleCalendarConnection } from '~/server/google-calendar'

export async function GET(req: NextRequest) {
    const auth = getAuthUser(req)

    if (!auth?.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const connection = await getGoogleCalendarConnection(auth.userId)

    return NextResponse.json({
        connected: Boolean(connection),
        googleEmail: connection?.googleEmail ?? null,
        connectedAt: connection?.updatedAt?.toISOString() ?? null,
    })
}
