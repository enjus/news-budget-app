# Deploying Schema Changes

This project does **not** use Prisma's migration history (`prisma migrate deploy`) in production.
Schema changes ship via `npx prisma db push`, which diffs `prisma/schema.prisma` against the live
database and applies whatever DDL is needed to match it. There is no migration file audit trail —
`schema.prisma` on `master` at any given moment *is* the source of truth for what the production
database should look like.

## Why `db push` instead of migrations

`prisma/migrations/` exists in the repo (an initial set from early development, last touched
2026-03-03) and `migration_lock.toml` is still stamped `provider = "sqlite"` from before the
project switched to Postgres. Neither has been kept current — production schema drift has been
handled with `db push` ever since, and no branch since has added a new migration file. Don't
add one unless you're deliberately restarting migration history for the whole project; a lone
migration folder alongside years of `db push` drift is worse than no migration folder.

`npm run build` runs `prisma generate && next build` — it does **not** run `db push`. Pushing the
schema is a separate, deliberate step you run as part of deploying, not something that happens
automatically on every build. (Older/abandoned branches that added `prisma db push` into the
`build` script, e.g. `feature/media-requests`, are not the current pattern — don't resurrect that.)

## The normal case: additive changes

Most schema changes in this project's history are additive — new tables, new nullable columns,
new relation fields on existing models. `feature/story-video-comments` (adding `Comment` and
`CommentMention`) is the template: nothing dropped, nothing renamed, every new column optional or
defaulted. For changes like this, deploying is just:

```bash
git pull origin master
npx prisma generate
npx prisma db push
npm run build
pm2 restart newsbudget   # or your process manager's equivalent
```

`db push` is non-destructive here because there's nothing for it to destroy — it only adds.

## The dangerous case: drops, renames, or type changes

`db push` computes the diff and applies it **without asking** and **without a rollback path** —
if the new schema no longer has a column, `db push` drops it and any data in it is gone. Watch
for this whenever a schema change:

- removes a field that existed in the deployed schema (renames count as remove + add)
- replaces scalar fields with a new related table (the indicator-tags rearchitecture below)
- narrows a column's type in a way Postgres can't losslessly cast

Check what changed before pushing:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Read the generated SQL. If it contains a `DROP COLUMN` or `DROP TABLE` touching data you need to
keep, you need a backfill step first — `db push` will not do this for you.

### Backfill pattern (see `feature/indicator-tags`)

`feature/indicator-tags` replaced four boolean flags (`Story.hereIsOregon`, `.contentRemix`,
`.summerFocus`, `.oregonInsight`) with a normalized `StoryTag` table. A plain `db push` against
the new schema would have dropped those boolean columns before anything captured their values.
The fix was a **one-time, hand-written SQL script** run before `db push`:

`prisma/manual-backfill-story-tags.sql` (deleted from the repo once applied — it's a bridge, not
a repeatable migration):

1. `CREATE TABLE IF NOT EXISTS` for the new table, matching what `db push` was about to create
   (so the later `db push` sees it already exists and only needs to touch the old columns).
2. `INSERT ... SELECT ... WHERE <old boolean> = true` to copy every set flag into the new shape.
3. A comment explaining anything intentionally *not* backfilled (that script dropped
   `Video.aiContributed` with no replacement, having confirmed it was unused).

Deploy sequence for a change like this:

```bash
psql "$DATABASE_URL" -f prisma/manual-backfill-<name>.sql   # 1. copy data into new shape
npx prisma db push                                          # 2. now safe — old columns are redundant
# 3. spot-check counts, e.g.:
psql "$DATABASE_URL" -c 'SELECT tag, count(*) FROM "StoryTag" GROUP BY tag;'
rm prisma/manual-backfill-<name>.sql                         # 4. one-time bridge, not kept around
npm run build
pm2 restart newsbudget
```

### Writing a new backfill script

When you introduce a schema change that would drop or reshape populated data:

- Name it `prisma/manual-backfill-<feature>.sql` and open with a comment block explaining *why*
  it's needed (what `db push` would otherwise destroy) and the exact run order relative to
  `db push`.
- Wrap it in `BEGIN; ... COMMIT;`.
- `CREATE TABLE IF NOT EXISTS` any new tables yourself, matching the Prisma-generated shape
  (column names/types/constraints as they'll appear after `db push` — check
  `prisma migrate diff` output above if unsure), so the subsequent `db push` only needs to handle
  the old columns.
- Supply `id` values explicitly (`md5(random()::text || clock_timestamp()::text || "<parentId>")`
  or similar) — Prisma's `cuid()` default is applied client-side, not by Postgres, so raw SQL
  inserts don't get one for free.
- Use `ON CONFLICT ... DO NOTHING` on any unique constraints so the script is safe to re-run if
  it fails partway.
- Note anything you're deliberately *not* migrating, and why (confirmed unused, no longer
  relevant, etc.) so a future reader doesn't assume it was an oversight.
- Delete the script once it's been run against production — it's single-use, not part of the
  ongoing schema history.

## Checklist before pushing a schema change to production

1. `git diff master..<branch> -- prisma/schema.prisma` — read every line.
2. Any dropped/renamed field or table with production data? Write a backfill script (above) and
   run it first.
3. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
   — confirm the DDL `db push` will actually run matches what you expect.
4. `npx prisma generate && npx prisma db push`.
5. Spot-check the affected tables.
6. `npm run build` and restart the app (see [docs/aws-vps-deployment.md](./aws-vps-deployment.md)
   for the VPS deploy script, or your platform's equivalent).
