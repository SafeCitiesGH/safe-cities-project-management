import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Privacy Policy — Safe Cities Workspace',
    description:
        'How Safe Cities Workspace collects, uses, stores and shares information, including data accessed through Google APIs.',
}

// Kept in one place so the header and the Google-facing "last updated" line
// can never drift apart.
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

export default function PrivacyPolicyPage() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <h1 className="font-serif text-4xl font-semibold tracking-tight">
                Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: {LAST_UPDATED}
            </p>

            <p className="mt-6 text-muted-foreground">
                Safe Cities Workspace (&ldquo;the Service&rdquo;) is a private
                project management application operated by Safe Cities
                (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what
                information the Service collects, why, how long it is kept, and
                who it is shared with. It applies to everyone who signs in to the
                Service.
            </p>

            <Section title="Who can use the Service">
                <p>
                    The Service is not open to the public. Accounts are created
                    by invitation and must be approved by a Safe Cities
                    administrator before any workspace content becomes visible.
                    The Service is not directed at children and we do not
                    knowingly collect information from anyone under 16.
                </p>
            </Section>

            <Section title="Information we collect">
                <p>
                    <strong className="text-foreground">
                        Account information.
                    </strong>{' '}
                    When you sign in, our authentication provider (Clerk) passes
                    us your name, your primary email address and a unique account
                    identifier. We store these so we can show who created or
                    edited something and so administrators can manage access. We
                    do not receive or store your password.
                </p>
                <p>
                    <strong className="text-foreground">
                        Content you create.
                    </strong>{' '}
                    Documents, spreadsheets, forms and form responses, folders and
                    programmes, comments, chat messages, calendar events, and any
                    files you upload. Documents and spreadsheets also retain a
                    version history of recent changes so earlier versions can be
                    restored.
                </p>
                <p>
                    <strong className="text-foreground">
                        Google account information, if you connect one.
                    </strong>{' '}
                    Described in its own section below. Connecting Google is
                    entirely optional and the Service works without it.
                </p>
                <p>
                    <strong className="text-foreground">
                        Operational records.
                    </strong>{' '}
                    Our hosting and database providers keep standard technical
                    logs, which may include IP addresses and request metadata, for
                    security and reliability purposes.
                </p>
                <p>
                    We do not use advertising cookies, we do not run third-party
                    analytics or tracking scripts, and we do not sell personal
                    information.
                </p>
            </Section>

            <Section title="Google account data">
                <p>
                    You may optionally connect a Google account so the Service can
                    show and manage your calendar alongside your work. If you
                    choose to, Google asks for your consent to the following
                    access:
                </p>
                <ul className="ml-5 list-disc space-y-2">
                    <li>
                        <code className="text-foreground">
                            https://www.googleapis.com/auth/calendar
                        </code>{' '}
                        — to read your calendar events so they can be displayed in
                        the Service, and to create, update and delete events you
                        ask the Service to manage on your behalf.
                    </li>
                    <li>
                        <code className="text-foreground">openid</code>,{' '}
                        <code className="text-foreground">email</code>,{' '}
                        <code className="text-foreground">profile</code> — to
                        identify which Google account has been connected, so the
                        Service can show you which account is in use.
                    </li>
                </ul>
                <p>
                    To keep that connection working we store the access token and
                    refresh token Google issues, the granted scopes, the token
                    expiry time, and the connected Google account&rsquo;s email
                    address and identifier. These are stored in our database and
                    are used only to make Google Calendar requests on your behalf.
                </p>
                <p>
                    We request calendar access at the time you connect and use it
                    only for the calendar features described above. We do not use
                    Google user data for advertising, we do not sell it, we do not
                    use it to train generalised artificial intelligence or machine
                    learning models, and no human reads it except where you have
                    explicitly asked us to for support, or where required by law
                    or for security investigations.
                </p>
                <p className="rounded-md border-l-2 border-foreground/20 pl-4">
                    Safe Cities Workspace&rsquo;s use and transfer of information
                    received from Google APIs to any other app will adhere to the{' '}
                    <a
                        className="underline underline-offset-2 hover:text-foreground"
                        href="https://developers.google.com/terms/api-services-user-data-policy"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements.
                </p>
            </Section>

            <Section title="Disconnecting Google">
                <p>
                    You can revoke the Service&rsquo;s access to your Google
                    account at any time from{' '}
                    <a
                        className="underline underline-offset-2 hover:text-foreground"
                        href="https://myaccount.google.com/permissions"
                        target="_blank"
                        rel="noreferrer"
                    >
                        your Google Account permissions page
                    </a>
                    . Revoking access stops the Service from making any further
                    requests to Google on your behalf.
                </p>
                <p>
                    To also have the stored tokens and connection record deleted
                    from our database, email us at{' '}
                    <a
                        className="underline underline-offset-2 hover:text-foreground"
                        href={`mailto:${CONTACT_EMAIL}`}
                    >
                        {CONTACT_EMAIL}
                    </a>{' '}
                    and we will remove them. Calendar events you created inside
                    the Service remain in the Service unless you delete them.
                </p>
            </Section>

            <Section title="How information is shared">
                <p>
                    Content you create is visible to other people in the workspace
                    according to the permissions set on each file, folder or
                    programme, and to Safe Cities administrators. Some files can
                    additionally be protected with a password, which is required
                    to open them.
                </p>
                <p>
                    Forms can be published as links that people outside the
                    workspace may open and submit. Anything you put in a published
                    form, and anything someone submits to it, should be treated
                    accordingly.
                </p>
                <p>
                    We share information with the service providers that run the
                    Service on our behalf: Clerk (authentication), Supabase
                    (database, file storage and real-time collaboration), Vercel
                    (application hosting) and Google (only if you connect a Google
                    account). We do not share personal information with anyone
                    else except where required by law.
                </p>
            </Section>

            <Section title="How long we keep it">
                <p>
                    Workspace content is kept until it is deleted from within the
                    Service. Document and spreadsheet version history retains a
                    limited number of recent versions and older ones are discarded
                    automatically.
                </p>
                <p>
                    Account records are kept for as long as the account exists.
                    When an account is deleted, the records attached to it,
                    including any stored Google connection, are deleted with it.
                </p>
            </Section>

            <Section title="Security">
                <p>
                    Access to the Service requires signing in, and every request
                    is checked against the permissions on the file being accessed.
                    Passwords set on individual files are stored only as
                    cryptographic hashes and cannot be read back by us. Data is
                    transmitted over encrypted connections.
                </p>
                <p>
                    No system is completely secure, and we cannot guarantee
                    absolute security. If you believe an account or a document has
                    been accessed improperly, contact us at the address below.
                </p>
            </Section>

            <Section title="Your choices">
                <p>
                    You can ask us to show you what personal information we hold
                    about you, correct it, or delete it, by emailing the address
                    below. Deleting your account removes your account record and
                    the data attached to it; content you contributed to shared
                    documents may remain where removing it would alter other
                    people&rsquo;s work.
                </p>
            </Section>

            <Section title="Changes to this policy">
                <p>
                    If this policy changes we will update the date at the top of
                    this page. Material changes affecting how Google user data is
                    handled will be communicated to affected users.
                </p>
            </Section>

            <Section title="Contact">
                <p>
                    Questions about this policy, or requests about your
                    information, can be sent to{' '}
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
                    <Link href="/terms" className="hover:text-foreground">
                        Terms of Service
                    </Link>
                </div>
            </div>
        </main>
    )
}
