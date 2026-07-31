import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '~/server/db'
import { files, pageContent } from '~/server/db/schema'
import {
    getUserPermissionContext,
    hasPermissionInContext,
} from '~/lib/permissions-simple'
import { getFileAncestors } from '~/lib/permissions'

/**
 * Polling endpoint used by the page view to notice edits made by other people.
 *
 * NOTE: `/api/*` is exempted from the Clerk checks in src/middleware.ts (tRPC
 * does its own auth per procedure), so every hand-written route here must
 * authenticate and authorise for itself. This one previously did neither and
 * returned full page content for any pageId to any caller — which also handed
 * out the contents of password-protected pages.
 */
export async function GET(req: NextRequest) {
    const pageId = Number(req.nextUrl.searchParams.get('pageId'))
    if (!Number.isInteger(pageId) || pageId <= 0) {
        return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })
    }

    const { userId } = await auth()
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const file = await db.query.files.findFirst({
        where: eq(files.id, pageId),
        columns: { id: true, isPasswordProtected: true },
    })
    if (!file) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const permissionContext = await getUserPermissionContext(userId)
    const ancestors = await getFileAncestors(pageId)
    const canView = hasPermissionInContext(
        permissionContext,
        pageId,
        'view',
        ancestors.map((ancestor) => ancestor.id)
    )
    if (!canView) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const page = await db.query.pageContent.findFirst({
        where: eq(pageContent.fileId, pageId),
        columns: { updatedAt: true, content: true },
    })

    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
        lastUpdated: page.updatedAt?.toISOString() ?? null,
        // Protected pages only ever release their content through the unlock
        // flow (files.getById with the password). The timestamp alone is
        // enough for the caller to know something changed.
        content: file.isPasswordProtected ? null : page.content,
    })
}
