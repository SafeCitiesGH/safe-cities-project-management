-- Standalone (file-less) chats: a `conversation` table, and a nullable
-- `conversationId` on `message` so a message belongs to EITHER a file or a
-- conversation. Idempotent so it's safe to run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS "safe-cities-project-management-v2_conversation" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar(256) NOT NULL,
    "createdBy" text,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE "safe-cities-project-management-v2_conversation"
        ADD CONSTRAINT "conversation_createdBy_user_id_fk"
        FOREIGN KEY ("createdBy")
        REFERENCES "safe-cities-project-management-v2_user"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "safe-cities-project-management-v2_message"
    ADD COLUMN IF NOT EXISTS "conversationId" integer;

DO $$ BEGIN
    ALTER TABLE "safe-cities-project-management-v2_message"
        ADD CONSTRAINT "message_conversationId_conversation_id_fk"
        FOREIGN KEY ("conversationId")
        REFERENCES "safe-cities-project-management-v2_conversation"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "message_conversation_idx"
    ON "safe-cities-project-management-v2_message" ("conversationId");
