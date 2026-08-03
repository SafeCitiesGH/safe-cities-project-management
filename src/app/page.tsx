import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

/**
 * Public landing page.
 *
 * Signed-in visitors go straight to the dashboard, exactly as before. Signed-out
 * visitors get this page instead of being bounced to Clerk, because Google
 * requires a publicly reachable application home page (alongside the privacy
 * policy and terms) before an OAuth app requesting sensitive scopes can be
 * published. A redirect to a sign-in screen does not satisfy that.
 */
export default async function Home() {
    const { userId } = await auth()
    if (userId) redirect('/dashboard')

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
            <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
                Safe Cities Workspace
            </h1>

            <p className="mt-6 text-lg text-muted-foreground">
                A private project management workspace for Safe Cities staff and
                partners. Teams use it to write and share documents and
                spreadsheets, collect responses through forms, organise work into
                programmes, and keep track of deadlines on a shared calendar.
            </p>

            <p className="mt-4 text-muted-foreground">
                Access is by invitation. Accounts are approved by a Safe Cities
                administrator before any workspace content becomes visible.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                    href="/dashboard"
                    className="inline-flex h-10 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Sign in
                </Link>
                <span className="text-sm text-muted-foreground">
                    Already approved? Sign in to reach your workspace.
                </span>
            </div>

            <div className="mt-16 border-t pt-6 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Link href="/privacy" className="hover:text-foreground">
                        Privacy Policy
                    </Link>
                    <Link href="/terms" className="hover:text-foreground">
                        Terms of Service
                    </Link>
                </div>
            </div>
        </main>
    )
}
