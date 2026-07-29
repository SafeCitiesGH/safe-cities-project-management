-- Per-file password protection (access gate; content is NOT encrypted at rest).
-- `passwordHash` is a bcrypt hash and must never be sent to the client — see
-- stripPasswordHash() / PUBLIC_FILE_COLUMNS in src/server/api/routers/files.ts.
--
-- Idempotent, in the same style as the other files in this directory. These
-- columns were originally created with `drizzle-kit push`, so on the existing
-- database this is a no-op; it exists so a new database can also be brought up
-- by hand without relying on push.
ALTER TABLE "safe-cities-project-management-v2_file"
    ADD COLUMN IF NOT EXISTS "isPasswordProtected" boolean DEFAULT false;

ALTER TABLE "safe-cities-project-management-v2_file"
    ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255);
