CREATE TABLE IF NOT EXISTS "safe-cities-project-management-v2_calendar_event" (
    "id" serial PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "title" varchar(512) NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "location" varchar(512) DEFAULT '' NOT NULL,
    "startAt" timestamp with time zone NOT NULL,
    "endAt" timestamp with time zone NOT NULL,
    "googleEventId" varchar(1024),
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "safe-cities-project-management-v2_calendar_event_userId_safe-cities-project-management-v2_user_id_fk"
        FOREIGN KEY ("userId")
        REFERENCES "safe-cities-project-management-v2_user"("id")
        ON DELETE cascade
        ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "calendar_event_user_start_idx"
    ON "safe-cities-project-management-v2_calendar_event" ("userId", "startAt");

-- NULL googleEventId values are distinct in Postgres, so events that have never
-- been pushed to Google do not collide here; already-pushed events cannot be
-- pushed a second time.
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_user_google_event_unq"
    ON "safe-cities-project-management-v2_calendar_event" ("userId", "googleEventId");
