-- Membership for standalone conversations: a conversation is private to the
-- users listed here (only they can see it or post). Run once in the Supabase
-- SQL editor.

CREATE TABLE IF NOT EXISTS "safe-cities-project-management-v2_conversation_member" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversationId" integer NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "safe-cities-project-management-v2_conversation_member"
        ADD CONSTRAINT "conversation_member_conversationId_fk"
        FOREIGN KEY ("conversationId")
        REFERENCES "safe-cities-project-management-v2_conversation"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "safe-cities-project-management-v2_conversation_member"
        ADD CONSTRAINT "conversation_member_userId_fk"
        FOREIGN KEY ("userId")
        REFERENCES "safe-cities-project-management-v2_user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "safe-cities-project-management-v2_conversation_member"
        ADD CONSTRAINT "conversation_member_unq"
        UNIQUE ("conversationId", "userId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "conversation_member_conversation_idx"
    ON "safe-cities-project-management-v2_conversation_member" ("conversationId");
CREATE INDEX IF NOT EXISTS "conversation_member_user_idx"
    ON "safe-cities-project-management-v2_conversation_member" ("userId");
