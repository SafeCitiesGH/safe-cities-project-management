-- ============================================================================
-- Live editing — Supabase Realtime Authorization policies
-- ============================================================================
-- Live editing uses PRIVATE Supabase Realtime channels named `doc:<id>`
-- (see src/hooks/use-supabase-yjs-collaboration.ts). Private channels are gated
-- by Row Level Security on the `realtime.messages` table. Without the policies
-- below, Supabase closes the channel and the editor shows
-- "Live editing: unavailable (closed)".
--
-- Run this ONCE in the Supabase dashboard → SQL Editor → New query → Run.
-- It is safe to re-run: everything below is create-or-replace / drop-if-exists.
--
-- Prerequisite: Clerk must be configured as a Supabase Third-Party Auth provider
-- so signed-in users arrive with role = authenticated and the Clerk user id in
-- the JWT `sub` claim (see docs/LIVE_EDITING_SUPABASE.md).
--
-- These policies enforce PER-DOCUMENT permissions. The previous version let any
-- signed-in user join any `doc:*` channel, which meant someone with no access to
-- a file — or who had never entered its password — could join its channel and
-- read the document's contents as people typed.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Permission check
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER because the `authenticated` role has no direct grants on the
-- app's tables (the app itself connects over DATABASE_URL as the owner). The
-- function is the only thing `authenticated` may call, and it returns a boolean
-- and nothing else.
--
-- It mirrors the app's own rule in src/lib/permissions-simple.ts:
--   * admins can open anything
--   * otherwise the user needs a row in file_permission for the file itself OR
--     for any ancestor folder/programme (permissions are inherited downwards)
-- `view` is enough — that is what the app requires to open a document.
create or replace function public.safe_cities_can_join_doc(p_file_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with recursive chain as (
        -- the document itself...
        select id, "parentId", 0 as depth
        from "safe-cities-project-management-v2_file"
        where id = p_file_id
      union all
        -- ...plus every folder/programme above it. The depth cap is a
        -- safety net: a cycle in parentId would otherwise loop forever
        -- inside a check that runs on every channel join.
        select f.id, f."parentId", c.depth + 1
        from "safe-cities-project-management-v2_file" f
        join chain c on f.id = c."parentId"
        where c.depth < 64
    )
    select
        -- Password-protected files never go over the realtime channel. RLS
        -- cannot know whether this user actually typed the password, so the
        -- only way the password gate holds is to keep those documents off the
        -- channel entirely. They still open, save and load normally — they just
        -- do not get live co-editing. Delete this NOT EXISTS block if you would
        -- rather have live editing on protected files than a strict gate.
        not exists (
            select 1
            from "safe-cities-project-management-v2_file" f
            where f.id = p_file_id
              and coalesce(f."isPasswordProtected", false)
        )
        and (
            exists (
                select 1
                from "safe-cities-project-management-v2_user" u
                where u.id = (select auth.jwt() ->> 'sub')
                  and u.role = 'admin'
            )
            or exists (
                select 1
                from "safe-cities-project-management-v2_file_permission" fp
                join chain c on c.id = fp."fileId"
                where fp."userId" = (select auth.jwt() ->> 'sub')
            )
        );
$$;

revoke all on function public.safe_cities_can_join_doc(integer) from public;
grant execute on function public.safe_cities_can_join_doc(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------

-- RLS is already enabled on realtime.messages when Realtime Authorization is
-- used; this line is a harmless no-op if it is already on.
alter table realtime.messages enable row level security;

-- RECEIVE broadcast/presence on a doc channel the user may open.
drop policy if exists "live_editing_read_doc_channels" on realtime.messages;
create policy "live_editing_read_doc_channels"
on realtime.messages
for select
to authenticated
using (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'doc:%'
    -- split_part returns '' for a malformed topic; the regex guard keeps the
    -- ::integer cast from erroring out on it.
    and split_part(realtime.topic(), ':', 2) ~ '^[0-9]+$'
    and public.safe_cities_can_join_doc(
        split_part(realtime.topic(), ':', 2)::integer
    )
);

-- SEND broadcast/presence on a doc channel the user may open.
drop policy if exists "live_editing_write_doc_channels" on realtime.messages;
create policy "live_editing_write_doc_channels"
on realtime.messages
for insert
to authenticated
with check (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'doc:%'
    and split_part(realtime.topic(), ':', 2) ~ '^[0-9]+$'
    and public.safe_cities_can_join_doc(
        split_part(realtime.topic(), ':', 2)::integer
    )
);

-- ----------------------------------------------------------------------------
-- Checking it worked
-- ----------------------------------------------------------------------------
-- Replace the ids below and run as a sanity check. The function reads the
-- caller's JWT, so from the SQL Editor (no JWT) it returns false for everything
-- — test by opening documents in the app, not by running this alone.
--
--   select public.safe_cities_can_join_doc(123);
--
-- In the app, confirm all four cases:
--   1. a document you own          -> "Live editing: connected"
--   2. a document shared with you  -> "Live editing: connected"
--   3. a document NOT shared with you -> channel refused (and you cannot open
--      the file anyway)
--   4. a password-protected document -> opens and saves normally, live editing
--      reports unavailable (expected — see the note in the function above)
