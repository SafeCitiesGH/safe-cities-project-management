import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Terms of Service — Safe Cities Workspace',
    description:
        'The terms that apply to use of the Safe Cities Workspace application.',
}

const LAST_UPDATED = '30 July 2026'
const CONTACT_EMAIL = 'safecitiesnpoheadoffice@gmail.com'

function Section({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <div className="mt-3 space-y-3 text-muted-foreground">
                {children}
            </div>
        </section>
    )
}

export default function TermsOfServicePage() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <h1 className="font-serif text-4xl font-semibold tracking-tight">
                Terms of Service
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: {LAST_UPDATED}
            </p>

            <p className="mt-6 text-muted-foreground">
                These terms govern your use of Safe Cities Workspace (&ldquo;the
                Service&rdquo;), operated by Safe Cities (&ldquo;we&rdquo;,
                &ldquo;us&rdquo;). By signing in to the Service you agree to them.
                If you do not agree, do not use the Service.
            </p>

            <Section title="Who may use the Service">
                <p>
                    The Service is a private workspace provided for Safe Cities
                    staff, volunteers and invited partners. Accounts are created
                    by invitation and must be approved by an administrator. We may
                    decline, suspend or remove an account at any time, including
                    when someone no longer needs access.
                </p>
                <p>
                    You are responsible for activity that happens under your
                    account. Do not share your sign-in credentials, and tell us
                    promptly if you think your account has been accessed by
                    someone else.
                </p>
            </Section>

            <Section title="Acceptable use">
                <p>You agree not to use the Service to:</p>
                <ul className="ml-5 list-disc space-y-2">
                    <li>
                        break the law, or infringe anyone&rsquo;s rights,
                        including intellectual property and privacy rights;
                    </li>
                    <li>
                        upload malware, or content that is unlawful, harassing or
                        abusive;
                    </li>
                    <li>
                        access documents, folders or programmes you have not been
                        given permission to see, or attempt to defeat the
                        permission or file-password controls;
                    </li>
                    <li>
                        disrupt or overload the Service, or probe it for
                        vulnerabilities without our written permission;
                    </li>
                    <li>
                        share workspace content outside Safe Cities except where
                        you are authorised to do so.
                    </li>
                </ul>
            </Section>

            <Section title="Your content">
                <p>
                    You keep ownership of the content you create or upload. You
                    grant us permission to store, display and process it for the
                    purpose of operating the Service for you and the people you
                    share it with.
                </p>
                <p>
                    Content created in the course of Safe Cities work is treated
                    as belonging to the organisation, in line with your employment,
                    volunteer or partnership arrangement. You are responsible for
                    having the right to upload what you upload.
                </p>
            </Section>

            <Section title="Connecting a Google account">
                <p>
                    You may optionally connect a Google account to use the
                    calendar features. Your use of Google services remains subject
                    to Google&rsquo;s own terms. What we access and store is
                    described in our{' '}
                    <Link
                        href="/privacy"
                        className="underline underline-offset-2 hover:text-foreground"
                    >
                        Privacy Policy
                    </Link>
                    , and you can disconnect at any time from your Google Account
                    permissions page.
                </p>
            </Section>

            <Section title="Availability and changes">
                <p>
                    We aim to keep the Service available and working, but we
                    provide it on an &ldquo;as is&rdquo; basis without warranties
                    of any kind. We may change, suspend or discontinue features,
                    and we may need to take the Service offline for maintenance.
                </p>
                <p>
                    The Service retains a limited version history for documents
                    and spreadsheets, but it is not a backup service. Keep your
                    own copies of anything you cannot afford to lose.
                </p>
            </Section>

            <Section title="Limitation of liability">
                <p>
                    To the fullest extent permitted by law, Safe Cities is not
                    liable for indirect, incidental or consequential damages, or
                    for lost data, profits or revenue, arising from your use of
                    the Service. Nothing in these terms limits liability that
                    cannot be limited by law.
                </p>
            </Section>

            <Section title="Ending access">
                <p>
                    You may stop using the Service at any time and ask us to
                    delete your account. We may end or suspend access if these
                    terms are breached, or when your relationship with Safe Cities
                    ends. Sections that by their nature should survive termination
                    will do so.
                </p>
            </Section>

            <Section title="Changes to these terms">
                <p>
                    We may update these terms. When we do, we will change the date
                    at the top of this page, and continued use of the Service
                    after that constitutes acceptance.
                </p>
            </Section>

            <Section title="Contact">
                <p>
                    Questions about these terms can be sent to{' '}
                    <a
                        className="underline underline-offset-2 hover:text-foreground"
                        href={`mailto:${CONTACT_EMAIL}`}
                    >
                        {CONTACT_EMAIL}
                    </a>
                    .
                </p>
            </Section>

            <div className="mt-16 border-t pt-6 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Link href="/about" className="hover:text-foreground">
                        About
                    </Link>
                    <Link href="/privacy" className="hover:text-foreground">
                        Privacy Policy
                    </Link>
                </div>
            </div>
        </main>
    )
}
