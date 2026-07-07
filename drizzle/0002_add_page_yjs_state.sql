-- Adds the canonical Yjs (CRDT) document state column for true simultaneous
-- editing. NULL means the page has never been opened collaboratively yet; the
-- first collaborative open seeds it from the existing HTML content.
ALTER TABLE "safe-cities-project-management-v2_page_content"
    ADD COLUMN IF NOT EXISTS "yjsState" text;
