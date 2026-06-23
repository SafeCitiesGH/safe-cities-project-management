# Implementation Plan — Programme Assignment & Password-Protected Files

**Author:** Engineering review draft
**Status:** For approval before any code is written
**Scope:** Two features against the recovered `safe-cities-project-management-v2` database.

---

## 0. Background: why the system behaves as it currently does

The application has two parallel, independent access paths. Understanding this is essential because Feature 1 is the structural repair for the post-recovery state.

**Role-based path (admins).** Every permission helper begins by reading `users.role`. If the role is `admin`, the check returns `edit` on *every* file and consults no other table. This is implemented identically in `permissions-ultra-fast.ts`, `permissions-simple.ts`, and `permissions-optimized.ts`. Admin visibility depends solely on that one column.

**Grant-based path (the `user` role).** A non-admin has no inherent access. Visibility is assembled from two tables:

- `file_permission` — explicit `(fileId, userId, permission)` grants.
- `effective_permission` — a precomputed cache that propagates each direct grant down to *all descendants* of the granted file.

The user-facing file tree (`files.getFilteredFileTree` → `getAccessibleFiles`) and the chat list (`chat.getRecentChats`) are built only from those rows.

**What recovery left us with.** The restore brought back the content tables (`file`, `user`, `page_content`, `forms`, …) but not the relationship rows in `file_permission` / `effective_permission`. With zero grant rows, a non-admin's accessible-file set computes to the empty set — hence no programmes, no pages, no chats. Admins are unaffected because their path never used those tables. Feature 1 re-establishes that missing path.

---

## Feature 1 — Assign a user to a programme

### Goal
An admin opens a programme (e.g. "Permaculture") and manages a **Members** panel: a list of assigned users with the ability to add and remove people. An assigned non-admin user can then see that programme and everything inside it on their own account.

### Why this is mostly wiring, not new machinery
A "programme" is already a `file` row with `type = 'programme'`. "Assigning" a user is already a `file_permission` row, and the inheritance engine (`rebuildEffectivePermissionsForUser`) already cascades a programme-level grant to every descendant page/sheet/form. The existing `permissions.setPermission` / `removePermission` endpoints already perform the grant and rebuild the cache. So the work is a **programme-scoped admin UI** plus a small number of correctness fixes.

### Decisions locked in
- **UI surface:** per-programme Members panel.
- **Granted permission level:** `view` by default (sufficient to see and read). The panel will expose an optional level selector (`view` / `comment` / `edit`) but default to `view`. *Confirm if you'd rather hard-lock it to `view` only.*

### Backend changes

1. **New tRPC procedures in `permissions.ts`** (admin-gated):
   - `assignUserToProgramme({ programmeId, userId, permission = 'view' })` — verifies the caller is an admin (reads `users.role`), confirms the target file's `type === 'programme'`, then calls the existing `setFilePermission` + cache rebuild. Reuses the existing notification insert so the assigned user is told.
   - `removeUserFromProgramme({ programmeId, userId })` — admin-gated wrapper over `removeFilePermission`.
   - `getProgrammeMembers({ programmeId })` — returns the users with a direct grant on the programme (joined to `users` for name/email/level). Admin-gated.

   These are thin wrappers; the heavy lifting already exists. Gating them on `role === 'admin'` (not merely "has edit") keeps assignment an admin-only operation, matching how programme *creation* is already admin-only in `new-file-dialog.tsx`.

2. **Fix `chat.getRecentChats` inheritance gap.** Today the non-admin branch reads `file_permission` directly, so a programme-level grant surfaces only the programme's own chat, not chats on descendant pages. Change that branch to read from `effective_permission` (which already contains the descendants) so chat visibility matches tree visibility. Small, isolated query change around `chat.ts:177`.

3. **(Optional) Bulk backfill helper.** Because recovery wiped all grants, you may want a one-off admin action "assign user to programme" that is enough on its own — no migration needed. If you also want to re-grant many users at once, I can add an admin-only `assignUsersToProgramme({ programmeId, userIds[] })`. Flagged as optional.

### Frontend changes

1. **`ProgrammeMembersPanel` component** (new, `src/components/programme-members-panel.tsx`):
   - Lists current members from `getProgrammeMembers`.
   - "Add member" control: a searchable user picker sourced from the existing `user.getAllUsers` query, plus the level selector (defaulting to `view`).
   - Remove (✕) button per member, calling `removeUserFromProgramme`.
   - Invalidates `getProgrammeMembers`, `batchCheckPermissions`, and the filtered file tree on success, mirroring the invalidation already done in `share-modal.tsx`.
   - Visible only to admins (guard on `user.getProfile` role, same pattern as `app/users/page.tsx`).

2. **Entry point.** Add a "Members" affordance on the programme view — most naturally a button in `file-header.tsx` (which already hosts the share modal) shown when `file.type === 'programme'` and the viewer is an admin, opening the panel in a dialog.

### Edge cases & correctness
- Re-assigning an existing member updates rather than duplicates (the underlying `setFilePermission` upserts).
- Removing a member triggers a cache rebuild so their tree/chats update within the 30s cache TTL.
- Assigning at the programme root is the intended granularity; descendants inherit automatically and should **not** be assigned individually.

---

## Feature 2 — Password-protected files

### Goal
When creating a file, the dialog shows a switch: "Password protect this file." Turning it on reveals two fields — password and confirm. On creation the file is marked protected. In the tree a 🔒 lock icon appears next to it. Opening it prompts for that file's password every time; a correct password reveals the content, a wrong one is rejected.

### Decisions locked in
- **Prompt frequency:** every open / navigation (no session caching).
- **Strength:** access gate via a hashed password check. The password is bcrypt-hashed server-side and verified before content is returned. Content is **not** encrypted at rest. This matches the described UX and keeps content recoverable by an admin if a password is forgotten.

> Security note recorded for transparency: a hashed gate prevents access through the application's normal data paths but does **not** make the row unreadable to someone with direct database access. If that threat matters later, Feature 2 can be upgraded to the "encryption at rest" variant — but that makes content permanently unrecoverable if the password is lost. We are intentionally choosing the gate.

### Schema change (migration required)

Add two columns to the `file` table in `src/server/db/schema.ts`:

```ts
isPasswordProtected: d.boolean().default(false),
passwordHash: d.varchar({ length: 255 }), // bcrypt hash, null when unprotected
```

- Both are nullable / defaulted, so the migration is **non-destructive** and safe on the recovered data (existing rows become `isPasswordProtected = false`).
- Migration applied via the project's existing `npm run db:push` (Drizzle). I will generate and show the SQL diff for your approval before running it.
- `passwordHash` is never sent to the client. The `File` TypeScript type and any `columns: {…}` selections that currently spread the whole row will be audited so the hash is excluded from client-facing payloads (notably `getById`, `getFileTree`, `getFilteredFileTree`).

### New dependency
`bcryptjs` (pure-JS, no native build step — safer on Vercel than `bcrypt`). Hashing and verification happen only in tRPC mutations/queries (server-side).

### Backend changes (`files.ts`)

1. **`create` mutation** gains optional input:
   ```ts
   password: z.string().min(4).optional()
   ```
   When present: hash with bcrypt, set `isPasswordProtected = true` and `passwordHash`. When absent: unprotected as today. (Confirm/match validation is enforced on the client; the server only receives the final password.)

2. **New `verifyFilePassword({ fileId, password })` query/mutation** — looks up the hash, `bcrypt.compare`s, returns `{ ok: true }` or a `FORBIDDEN`/`{ ok: false }`. Rate-consideration noted below.

3. **`getById` gate.** Before returning content, if `isPasswordProtected` is true, require proof of password. Two viable designs — I recommend **(a)**:
   - **(a) Client verifies, then fetches.** The unlock dialog calls `verifyFilePassword`; on success the client requests content. To keep this honest server-side (so the content endpoint can't be hit directly), `getById` accepts an optional `password` argument and re-checks it for protected files, returning `FORBIDDEN` if absent/incorrect. This satisfies "prompted every time" because no unlock state is persisted.
   - (b) Short-lived signed token returned by `verifyFilePassword` and replayed to `getById`. More moving parts; only needed if we later want session caching, which we explicitly do not.

   I'll implement (a): `getById` (and the page/sheet/form content loaders that mirror it) re-verify the supplied password for protected files.

4. **Admin bypass decision (needs your call — see open questions).** Should an admin be required to enter the password too, or bypass it? Default in this plan: **admins must also enter the password** (the lock is treated as content-level, not access-level), but a bypass is a one-line change if you prefer.

### Frontend changes

1. **`new-file-dialog.tsx`:**
   - Add a `Switch` ("Password protect this file") using the existing `ui/switch` component, plus conditional password + confirm `Input`s.
   - Client validation: non-empty, `password === confirm`, minimum length; block submit otherwise with an inline message.
   - Pass `password` into the existing `createFileMutation.mutate({…})` call in `handleCreate`. Applies to page/sheet/form/folder; uploads can be included or excluded — *confirm whether uploads should be lockable.*

2. **Lock icon in the tree** (`file-tree.tsx` and/or `sidebar/programme-section.tsx`):
   - Render a small lock glyph next to nodes where `isPasswordProtected` is true. Requires adding `isPasswordProtected` to the `columns` selection in `getFilteredFileTree` / `getFileTree` (the hash itself stays server-only).

3. **Unlock dialog** (new `src/components/file-unlock-dialog.tsx`):
   - Intercepts navigation/open of a protected file. A single password field → calls `verifyFilePassword`; on success proceeds to load content (passing the password through to `getById` per design (a)); on failure shows "Incorrect password" and stays closed.
   - Because there is no caching, the dialog appears on every visit to the file, satisfying the chosen behavior.

### Edge cases & hardening
- **Brute force:** because there's no lockout, I'll add a minimal in-memory attempt throttle per `(userId, fileId)` on `verifyFilePassword` (e.g. small delay / capped attempts per minute). Noted for review; can be expanded later.
- **Forgot password:** since content isn't encrypted, an admin can clear protection. I'll add an admin-only `removeFilePassword({ fileId })` mutation so a lost password isn't permanently blocking.
- **Changing a password / protecting an existing file:** out of scope for v1 (creation-time only) unless you want it now — easy to add a "manage protection" action later.

---

## Migration & rollout sequence

1. Add `bcryptjs` to dependencies.
2. Edit `schema.ts` (two new columns) and update the `File` type.
3. Generate the Drizzle SQL diff and **show it to you for approval**.
4. Run `npm run db:push` against the database (non-destructive; existing files default to unprotected).
5. Implement backend procedures (Feature 1 wrappers + chat fix; Feature 2 create/verify/getById).
6. Implement frontend (Members panel + entry point; create-dialog switch; lock icon; unlock dialog).
7. Verify with `npm run check` (lint + `tsc --noEmit`) and a manual pass as both an admin and a freshly-assigned non-admin account.

---

## Verification plan
- Type-check and lint clean (`npm run check`).
- **Feature 1:** as admin, assign a test `user`-role account to one programme → confirm that account now sees the programme, its descendant pages/sheets/forms, and the programme chat, and still cannot see *unassigned* programmes. Remove the member → confirm visibility revokes after cache TTL.
- **Feature 2:** create a protected page → confirm lock icon, correct password opens it, wrong password is rejected, and the prompt reappears on every revisit. Confirm `passwordHash` never appears in any network response.

---

## Open questions for you
1. **Feature 1 level:** lock assignments to `view` only, or keep the optional `view/comment/edit` selector?
2. **Feature 2 admin bypass:** must admins also enter the file password, or bypass it?
3. **Feature 2 scope:** should *uploads* be lockable, or only page/sheet/form/folder?
4. **Feature 1 bulk backfill:** want a "assign many users at once" helper to speed up re-granting after recovery, or one-at-a-time is fine?
