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
