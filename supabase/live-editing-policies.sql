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
-- Prerequisite: Clerk must be configured as a Supabase Third-Party Auth provider
-- so signed-in users arrive with role = authenticated
-- (see docs/LIVE_EDITING_SUPABASE.md).
-- ----------------------------------------------------------------------------

-- RLS is already enabled on realtime.messages when Realtime Authorization is
-- used; this line is a harmless no-op if it is already on.
alter table realtime.messages enable row level security;

-- Allow any signed-in user to RECEIVE broadcast/presence on doc:* channels.
drop policy if exists "live_editing_read_doc_channels" on realtime.messages;
create policy "live_editing_read_doc_channels"
on realtime.messages
for select
to authenticated
using (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'doc:%'
);

-- Allow any signed-in user to SEND broadcast/presence on doc:* channels.
drop policy if exists "live_editing_write_doc_channels" on realtime.messages;
create policy "live_editing_write_doc_channels"
on realtime.messages
for insert
to authenticated
with check (
    extension in ('broadcast', 'presence')
    and realtime.topic() like 'doc:%'
);

-- NOTE: These policies let ANY signed-in user join ANY document's channel. That
-- is a big improvement over public channels (which require no login at all), but
-- it does not yet enforce per-document permissions. To tighten later, parse the
-- document id out of realtime.topic() (e.g. split_part(realtime.topic(), ':', 2))
-- and check it against the app's file/permission tables inside the USING/CHECK.
