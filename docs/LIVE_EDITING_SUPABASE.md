# Live editing (real-time collaboration) via Supabase Realtime

Live editing is powered by **Supabase Realtime** — the same Supabase project the
app already uses. There is **no separate server** and **no extra cost**.

- Client hook: `src/hooks/use-supabase-yjs-collaboration.ts`
- Transport: **private** Supabase Realtime channels named `doc:<documentId>`

When a channel can't be authorized, the editor shows
**"Live editing: unavailable (closed)."** Private channels require two one-time
setup steps below. After that it just works, including on Vercel.

---

## Part A — Connect Clerk to Supabase (Third-Party Auth)

This makes Supabase trust your Clerk users and see them as `authenticated`, which
is required to open a private channel. (The old JWT-template/secret method was
deprecated by Supabase in April 2025 — don't use it.)

Official guide (follow this if the dashboard UI differs from the steps below):
https://clerk.com/docs/integrations/databases/supabase

1. **Clerk dashboard** → your app → **Integrations** → enable **Supabase**.
   - Clerk turns on the `role: "authenticated"` claim in session tokens and shows
     you your **Clerk domain** (looks like `https://your-app.clerk.accounts.dev`).
   - Copy that domain.
2. **Supabase dashboard** → **Authentication** → **Sign In / Providers** →
   **Third-Party Auth** → **Add provider** → **Clerk**.
   - Paste the Clerk domain from step 1. Save.

## Part B — Add the Realtime access rules

1. **Supabase dashboard** → **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/live-editing-policies.sql`](../supabase/live-editing-policies.sql)
   and click **Run**.

This grants signed-in users access to the `doc:*` channels. (It does not yet
enforce per-document permissions — see the note at the bottom of the SQL file.)

## Part C — Environment variables

Live editing uses the Supabase vars the app already needs. Confirm both are set
**in Vercel** (Settings → Environment Variables) and locally in `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No new variables are required. If you had to add them in Vercel, **redeploy**
(these are baked in at build time).

---

## Verify

Open a document, then DevTools → Console.

- **Working:** the status bar reads **"Live editing: connected."** Open the same
  document in a second signed-in browser and confirm edits + cursors sync.
- **Still closed:** look for a log line
  `Supabase live editing channel failed: { ..., tokenSource, tokenClaims, restAuthStatus }`
  - `tokenSource: "clerk-session-missing-authenticated-role"` → **Part A** isn't
    active. Re-check the Clerk Supabase integration and the Supabase provider.
  - `tokenSource: "clerk-session"` (role authenticated) but still closed →
    **Part B** — the SQL policies didn't apply. Re-run the SQL.

---

## Emergency fallback (temporary, less secure)

If Part A/B can't be completed in time and you need live editing working *now*,
switch to public channels: in `src/hooks/use-supabase-yjs-collaboration.ts` set

```ts
const USE_PRIVATE_REALTIME = false
```

Public channels need no Clerk/RLS setup and work with just the anon key, but the
edit stream can be joined by anyone with the app's public key who guesses a
document id. Flip it back to `true` once Parts A/B are done.
