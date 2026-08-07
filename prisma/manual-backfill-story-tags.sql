-- Run this BEFORE `prisma db push` for the feature/indicator-tags schema change.
--
-- Why: this project syncs schema via `prisma db push` (see migration_lock.toml,
-- still stamped "sqlite" from before the Postgres switch — there is no live
-- migration history). A plain `db push` against the new schema.prisma would
-- drop Story.hereIsOregon / contentRemix / summerFocus / oregonInsight and
-- Video.aiContributed outright, silently losing every story's existing
-- editorial-tag flags. This script creates the new StoryTag table ahead of
-- time and copies the boolean values into it, so `db push` afterward only
-- has to drop the now-redundant boolean columns — no data loss.
--
-- Usage:
--   1. psql "$DATABASE_URL" -f prisma/manual-backfill-story-tags.sql
--   2. npx prisma db push
--   3. Spot-check: SELECT tag, count(*) FROM "StoryTag" GROUP BY tag;
--      should roughly match the old `SELECT count(*) FILTER (WHERE hereIsOregon), ...`
--      counts you can pull beforehand if you want a before/after comparison.
--   4. Delete this file once applied — it's a one-time bridge, not a repeatable migration.

BEGIN;

CREATE TABLE IF NOT EXISTS "StoryTag" (
    "id"        TEXT NOT NULL,
    "storyId"   TEXT NOT NULL,
    "tag"       TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryTag_storyId_fkey" FOREIGN KEY ("storyId")
        REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryTag_storyId_tag_key" ON "StoryTag"("storyId", "tag");
CREATE INDEX IF NOT EXISTS "StoryTag_tag_idx" ON "StoryTag"("tag");

-- Backfill one StoryTag row per set boolean flag, using a random hex string as
-- id (Prisma's cuid() default is applied client-side, not by the database, so
-- inserts done here need to supply an id explicitly).
INSERT INTO "StoryTag" ("id", "storyId", "tag")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'HERE_IS_OREGON'
FROM "Story" WHERE "hereIsOregon" = true
ON CONFLICT ("storyId", "tag") DO NOTHING;

INSERT INTO "StoryTag" ("id", "storyId", "tag")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'CONTENT_REMIX'
FROM "Story" WHERE "contentRemix" = true
ON CONFLICT ("storyId", "tag") DO NOTHING;

INSERT INTO "StoryTag" ("id", "storyId", "tag")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'SUMMER_FOCUS'
FROM "Story" WHERE "summerFocus" = true
ON CONFLICT ("storyId", "tag") DO NOTHING;

INSERT INTO "StoryTag" ("id", "storyId", "tag")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'OREGON_INSIGHT'
FROM "Story" WHERE "oregonInsight" = true
ON CONFLICT ("storyId", "tag") DO NOTHING;

-- Note: Video.aiContributed is dropped with no equivalent — confirmed unused
-- in practice (see feature/indicator-tags discussion). Nothing to backfill.

COMMIT;
