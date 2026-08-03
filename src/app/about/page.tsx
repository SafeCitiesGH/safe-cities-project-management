import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'About — Safe Cities Workspace',
    description:
        'Safe Cities Workspace is a private project management application for Safe Cities staff and partners.',
}

/**
 * Public "about" page.
 *
 * This is the application home page URL given to Google. Google requires a
 * publicly reachable home page, privacy policy and terms of service before an
 * OAuth app requesting sensitive scopes can be published, and `/` deliberately
 * sends everyone to sign in instead.
 */
export default function AboutPage() {
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

            <p className="mt-4 text-muted-foreground">
                Members can optionally connect a Google account so their calendar
                appears alongside their work. That connection is never required,
                and can be revoked at any time.
            </p>

            <div className="mt-10">
                <Link
                    href="/"
                    className="inline-flex h-10 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Sign in
                </Link>
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
