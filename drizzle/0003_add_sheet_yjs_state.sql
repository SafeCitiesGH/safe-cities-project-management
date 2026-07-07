-- Adds the canonical Yjs (CRDT) state column for cell-level simultaneous sheet
-- editing. NULL until the sheet is first opened collaboratively.
ALTER TABLE "safe-cities-project-management-v2_sheet_content"
    ADD COLUMN IF NOT EXISTS "yjsState" text;
