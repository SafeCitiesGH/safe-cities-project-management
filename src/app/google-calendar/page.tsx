import { redirect } from 'next/navigation'

/**
 * The calendar no longer requires Google, so it lives at /calendar. This keeps
 * old links and bookmarks working, and forwards the OAuth result params that
 * an in-flight callback may still be pointing here.
 */
export default async function GoogleCalendarPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = new URLSearchParams()

    for (const [key, value] of Object.entries(await searchParams)) {
        if (typeof value === 'string') {
            params.set(key, value)
        }
    }

    const query = params.toString()
    redirect(query ? `/calendar?${query}` : '/calendar')
}
