import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '~/server/db'

export const dynamic = 'force-dynamic'

function getBearerToken(request: Request) {
    const authorization = request.headers.get('authorization')

    if (!authorization?.startsWith('Bearer ')) {
        return null
    }

    return authorization.slice('Bearer '.length)
}

export async function GET(request: Request) {
    const keepaliveSecret = process.env.KEEPALIVE_SECRET

    if (keepaliveSecret && getBearerToken(request) !== keepaliveSecret) {
        return NextResponse.json({ ok: false }, { status: 401 })
    }

    const touchedAt = new Date()

    await db.execute(sql`
        update public.keepalive_pings
        set touched_at = ${touchedAt}
        where id = 1
    `)

    return NextResponse.json({ ok: true, touchedAt: touchedAt.toISOString() })
}
