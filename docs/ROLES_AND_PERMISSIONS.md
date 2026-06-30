# Roles & Permissions — How Auth Works in This App

This document explains how user roles and permissions work, where each piece of
data lives, how to change a role, and the gotchas to watch for. The short version:

> **Clerk handles *authentication* (who you are). The database handles *authorization* (what you're allowed to do).**

---

## The two role stores

There are **two** places a user's role is recorded, and they serve different purposes.

### 1. The database — `users.role` (authoritative for the app)

This is the `role` column on the `users` table in Postgres (hosted on Supabase).
Allowed values: `unverified`, `user`, `admin`.

**Every permission decision in the application reads this column.** File
visibility, programme access, the admin-only Members panel, password bypass,
and the `adminProcedure` gate all query `users.role` from the database. If you
change this value, the app's behaviour updates almost immediately (there's a
~30-second in-memory permission cache).

### 2. Clerk — `publicMetadata.role` (used only by the middleware)

Clerk stores a *copy* of the role in the user's `publicMetadata`, and that copy
is baked into the session token (JWT). It looks like this:

```json
{ "role": "admin", "onboardingComplete": true }
```

The **only** place this copy is used is `middleware.ts`, which reads it from the
session claims to gate the `/users` route and the onboarding redirect. The
middleware runs at the edge before the server code, so it can't cheaply query
the database — caching the role in the token is a performance shortcut.

Everything else ignores Clerk's role copy.

---

## What Clerk does (and doesn't do)

Clerk is the **authentication / identity** layer. Its responsibilities:

- **Login** — the sign-in / sign-up screens and credential verification.
- **Sessions** — issues the session token used on *every* request (not just at
  login). `getAuthUser` pulls `userId` from this token on each request.
- **Identity** — the canonical user ID. `users.id` *is* the Clerk user ID. On a
  user's first request, the app copies their name and email from Clerk into the
  `users` table and creates their row with `role = 'unverified'`.
- **The cached role claim** described above, for the middleware.
- **User deletion** — `deleteUser` removes the account from Clerk as well as the
  database.

Clerk does **not** decide permissions. It answers "who are you"; the database
answers "what can you do."

---

## How to change a user's role

**Use the Users admin page (`/users`).** Each user row has a "⋯" menu with
**Make User** and **Make Admin**. Clicking one runs the `updateUserRole`
mutation, which does both halves automatically:

1. Updates `users.role` in the database.
2. Calls Clerk's API to write `publicMetadata` as
   `{ onboardingComplete: true, role }`.

**You do not need to edit anything in the Clerk dashboard.** The button writes
that JSON for you. Manual editing of `publicMetadata` in the Clerk dashboard is
only needed in the one case below (bootstrapping the first admin).

### Edge case: demoting to `unverified`

`updateUserRole` only writes to Clerk when the new role is **not** `unverified`.
If you demote someone to `unverified`, the database updates but Clerk's
`publicMetadata` keeps the stale (higher) role until it's changed another way.
Promoting/demoting between `user` and `admin` updates both sides correctly.

---

## Important: the session-refresh lag

When you change a role:

- The **database** updates instantly, so all of the app's permission logic
  treats the user correctly within seconds.
- The **Clerk session token** still carries the *old* role claim until the
  user's token refreshes — i.e. until they **refresh the page or sign out and
  back in**.

This matters specifically for the `/users` route gate (which reads the Clerk
claim): a freshly-promoted admin may be bounced from `/users` until they
re-login, even though every other admin capability already works.

The Users page shows a toast after a role change reminding you of this:

> **Role updated** — For the change to fully take effect, the user must refresh
> their page or sign out and back in.

---

## Bootstrapping the first admin (chicken-and-egg)

Role-changing endpoints are now **admin-only** (see Security below), so only an
existing admin can promote others. If you ever reach a state with **zero
admins** (e.g. a fresh database), nobody can click the button. To seed the first
admin manually, do **one** of:

- Set `role = 'admin'` directly on that user's row in the database (Supabase
  table editor or SQL), **and** set their Clerk `publicMetadata` to
  `{ "role": "admin", "onboardingComplete": true }` in the Clerk dashboard so
  the middleware also recognises them; then have them re-login.
- Or, before the hardening was in place, the in-app button — but with the gate
  active you need an existing admin, hence the manual route for the very first one.

---

## Security model (server-side gating)

- **`updateUserRole`** and **`deleteUser`** are `adminProcedure` — they verify
  the caller is an admin in the database and reject everyone else with
  `FORBIDDEN`. This prevents a non-admin from calling them directly through the
  API (privilege escalation / destructive actions).
- **`getAllUsers`** is intentionally left open to any authenticated user. The
  file-sharing modal and task-assignment UI need it so non-admin editors can
  pick people to share with. It exposes only a name/email/role directory inside
  the app — a deliberate, low-risk trade-off.

---

## How this connects to the recovery problem

After the database was restored, non-admin users could see nothing because the
restore brought back content (`files`, `users`, etc.) but **not** the permission
rows (`file_permission` / `effective_permission`). Admins were unaffected
because their access comes from the role short-circuit, not those rows.

The fix is re-establishing access via the role/permission tables:

- Promote trusted people to the right role on `/users`.
- Assign users to programmes via the **Members** panel on each programme (admin
  only). A programme-level grant cascades to every page/sheet/form inside it
  through the effective-permissions cache.

---

## Quick reference

| Question | Answer |
| --- | --- |
| Who am I? (authentication) | **Clerk** (login + session token, every request) |
| What can I do? (authorization) | **Database** `users.role` + permission tables |
| What does the middleware check? | **Clerk** `publicMetadata.role` (only for `/users` + onboarding) |
| How do I change a role? | `/users` page → Make User / Make Admin (writes DB **and** Clerk) |
| Do I edit Clerk's JSON by hand? | No — only to seed the very first admin |
| When does a role change take effect? | DB-driven permissions: instantly. `/users` route gate: after the user refreshes / re-logs in |
| Who can change roles / delete users? | Admins only (server-enforced) |
| Who can list users? | Any logged-in user (needed for sharing) |
