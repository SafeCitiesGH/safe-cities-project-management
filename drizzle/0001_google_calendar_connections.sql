CREATE TABLE IF NOT EXISTS "safe-cities-project-management-v2_google_calendar_connection" (
    "userId" text PRIMARY KEY NOT NULL,
    "googleAccountId" varchar(255),
    "googleEmail" varchar(320),
    "accessToken" text,
    "refreshToken" text NOT NULL,
    "scope" text,
    "tokenType" varchar(64),
    "expiryDate" timestamp,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "safe-cities-project-management-v2_google_calendar_connection_userId_safe-cities-project-management-v2_user_id_fk"
        FOREIGN KEY ("userId")
        REFERENCES "safe-cities-project-management-v2_user"("id")
        ON DELETE cascade
        ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "google_calendar_connection_email_idx"
    ON "safe-cities-project-management-v2_google_calendar_connection" ("googleEmail");

CREATE INDEX IF NOT EXISTS "google_calendar_connection_updated_idx"
    ON "safe-cities-project-management-v2_google_calendar_connection" ("updatedAt");
