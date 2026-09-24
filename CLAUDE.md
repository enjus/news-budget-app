# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server at http://localhost:3000 (Turbopack)
npm run build            # Production build (prisma generate + next build — does NOT push schema)
npm run start            # Production server
npm run lint             # ESLint
npm test                 # vitest run — unit tests (see below)

npx prisma studio        # Database browser UI
npx prisma db seed       # Re-seed (runs prisma/seed.ts via ts-node)
npx prisma db push       # Apply schema changes to the DB (the real workflow — see note below)
npx prisma generate      # Regenerate Prisma client (runs automatically via postinstall)
```

If `npm run build` or `tsc --noEmit` fails with "Cannot find module" for a package that *is* in `package.json` (e.g. `nodemailer`), `node_modules` has drifted — run `npm install` first.

**Vitest** was added in the staffing schedule work (issue #19, PR #68) specifically to cover `resolveDay()`'s date-precedence logic and the range-write helpers in `schedule-writes.ts` — pure functions with enough branching (explicit override vs. standing pattern vs. holiday, half-day splits, collision clearing) that eyeballing a diff isn't enough to trust it. `vitest.config.mts` runs in `node` environment with `vite-tsconfig-paths` so `@/` imports resolve the same as in the app. Coverage is narrow and deliberate, not a general suite: `src/lib/schedule.test.ts`, `src/lib/schedule-writes.test.ts`, `src/app/schedule/today/groupPeople.test.ts`. This is a **departure from the org-wide CLAUDE.md's "don't suggest adding test infrastructure" guidance** — that guidance is scoped to personal single-user tools, and this app is multi-user (real auth/roles/admin/teams in active use), so it doesn't apply here; the rest of the app (API routes, components) still leans on `npm run build`/`tsc --noEmit` as the primary correctness check. Follow the existing tests' pattern (pure-function unit tests, no DB/network mocking) if adding more — don't stand up a broader test harness (component tests, API route tests, `msw`, etc.) without the user asking.

**Before editing shared files** (API routes, `src/lib/*`, or the budget-view components `StoryCard.tsx`/`VideoCard.tsx`/`AgendaView.tsx`/`ColumnsView.tsx`/`EnterpriseView.tsx`): run `gh pr list --state open` — this repo often has several feature branches in flight that rewrite the same file (e.g. `*/content/route.ts`, or all of the budget card components at once). If an open PR already touches your target file, run `gh pr diff <number>` to see exactly which lines — adjacent-line edits in the same JSX block usually merge cleanly, but do the check before assuming so.
`npm run lint` ignores `.claude/worktrees/*` (`eslint.config.mjs` `globalIgnores`) — runs in seconds and reports only real source files.
**Schema changes are deployed via `prisma db push`, not migrations.** `prisma/migrations/migration_lock.toml` is still stamped `provider = "sqlite"` from before the project moved to Postgres, and no migration has been added since — `prisma migrate dev`/`deploy` are effectively dead here. Before a schema change that drops or renames a column with existing data, write a one-off SQL backfill script to run *before* `db push` (see `prisma/manual-backfill-story-tags.sql` for the pattern) — there's no migration history to roll back to otherwise. `npm run build` only runs `prisma generate` and never pushes the schema: production (VPS) applies changes as a manual deploy step (`npx prisma db push`, see `docs/aws-vps-deployment.md` §7). Vercel uses a separate `vercel-build` script (`scripts/vercel-build-db-sync.js`) that runs `prisma db push --accept-data-loss` automatically, but **only when `VERCEL_ENV === 'preview'`** — production-on-Vercel and anything else skips it. If story/video saves start failing on a preview deploy with a generic 500, check whether the preview DB is missing recently added columns first.

## Architecture Overview

**News budget management app** for tracking editorial stories and videos across daily/enterprise/edition/shelved views with drag-and-drop scheduling.

Stack is in `package.json`. Gotchas: use Prisma 5 (NOT v7; v7 broke SQLite with driver adapters); Zod v4 idioms are `z.string().cuid()` and `.flatten().fieldErrors` for errors.

### Key Design Decisions

**Enums as Strings**: All enum-like fields (`status`, `role`, `type`, `defaultRole`, `appRole`) are stored as `String` in the DB schema. Zod schemas in `src/lib/validations.ts` enforce valid values at the API layer. This preserves flexibility for migrations.

**No server components for data**: Pages are thin wrappers; data fetching is client-side via SWR hooks in `src/lib/hooks/`. The pattern is: `page.tsx` → `*Wrapper.tsx` (fetches data) → `*View.tsx` or `*Detail.tsx` (renders).

**Budget API returns grouped data**: `/api/budget/daily` returns content grouped by `TIME_BUCKET` (TBD/MORNING/MIDDAY/AFTERNOON/EVENING). `/api/budget/enterprise` groups by week (Monday). `/api/budget/edition` groups by print publication date. See `src/lib/utils.ts` for `dateToBucket()` logic.

**Optimistic drag-and-drop**: dnd-kit updates local SWR cache immediately on drop; server PATCH confirms persistence. `sortOrder` field on Story/Video drives ordering.

**Off-budget draft visibility has no access gate — it's a staging state, not a privacy boundary**: A draft (`onBudget: false`) is readable and writable by anyone who can already write content (`canCreateContent(role)`), the same role floor every other Story/Video write already uses — there is no ownership/assignment check on top of it, and none on GET either. The old `blockedFromDraft()` ownership gate (creator/assignee/admin only) was deliberately removed: it was the only place in the app where write access was ownership-gated rather than role-gated, and published content is already visible newsroom-wide with no per-team scoping, so a draft wasn't meaningfully more sensitive. Exposure is limited by navigability alone (you need to already know/guess a `/stories/[id]` URL, or browse to a `/people/[id]`/`/teams` page that lists it) — the same soft model the Teams feature itself uses (nav item hidden below Leadership, but the route and API aren't actually blocked). "Send to budget" (`/api/stories/[id]/publish`, `/api/videos/[id]/publish`) has no gate beyond an authenticated session — it never had a role check, and removing the ownership check left it that way on purpose. Two things stay unchanged: `/api/search` still excludes plain drafts (`onBudget: false`, `pitchedAt: null`) — see `docs/pitches.md` for why a pitch is exempt — and `/api/people/[id]/content`/`/api/teams/[id]/content` now *include* drafts (they used to filter `onBudget: true`), each item's `onBudget` field distinguishing them; `/people/[id]` and the Teams member view render drafts in their own collapsible "Drafts" section rather than mixed into TBD/Upcoming/Past, and `/me`'s `AssignedContentSection` filters drafts back out since its dedicated "My Drafts" section (`/api/drafts`, still creator-or-assignee-scoped as a personal convenience filter, not an access boundary) already covers them.

**TBD content**: Items without a publication time have `onlinePubDateTBD: true` and float in a TBD bucket. A `TBD_CAP` (500) prevents unbounded queries.

**"Today" boundary**: Always use `todayString()` (`src/lib/utils.ts`, Pacific-time) to compute "today" for upcoming/past splits — never `format(new Date(), "yyyy-MM-dd")` or other browser-local-time formatting. Mixing the two causes near-midnight categorization bugs when client and server disagree on the boundary.

**Comment timestamps vs. pub dates**: `formatPubDate()` reads `getUTC*` because pub times are "newsroom time encoded as UTC". A `Comment.createdAt` is a *genuine* instant, so it must be formatted with `formatTimestampPacific()` (Intl + `America/Los_Angeles`) instead — using `formatPubDate()` on it would display the wrong time.

**Comment notifications**: @-mentioned People are always emailed. "Post and Notify All" additionally emails the item's whole team — assignees plus, on stories, anyone credited on a visual element — minus anyone already emailed as a mention and minus the comment's author. This is the same recipient set `notifyStoryTeam()` uses, via the shared `collectEmails(assignments, visuals)`; keep the two in sync. Videos have no visuals relation, so `createComment()` selects `visuals` only on the story branch. Editing a comment sends nothing.

**Inactive people (`Person.isActive`)**: Deactivating a Person hides them from pickers for new assignments/stories but keeps their historical assignments, visuals, and comment mentions intact — nothing is deleted or reassigned. Less obvious: `collectEmails()` (`src/lib/notifications.ts`) and `listComments()`/`createComment()` (`src/lib/comments.ts`) both select `isActive` and filter inactive people out of notification recipient sets, even if they're still assigned/credited/mentioned on the item. So an inactive person can remain visible on a story's team list while silently receiving no emails about it.

**Pitches (issue #24, dark-launched behind `PITCHES_ENABLED`)**: a newsroom-wide pool for tips and unassigned stories, built entirely on the `Story` model — a pitch is `onBudget: false` with `pitchedAt` set; there's no separate Pitch table. Full detail (filing, claim/unclaim vs. send-to-budget, the `purge-shelved` cron, the `pitchedAt`/`expiresAt`/`pitchText` fields, why the pool endpoint uses an explicit `select`) is in **[`docs/pitches.md`](docs/pitches.md)** — load it before touching `/api/pitches`, `/api/budget/pitches`, `/api/stories/[id]/(claim|unclaim|send-to-budget)`, `/budget/pitches`, `usePitches()`, or the `Pitch*` components.

**Dark-launch rule for Pitches**: staying dark-launched means more than the `PITCHES_ENABLED` nav gate — no other tool or page (search, `/me`, dashboards, etc.) should surface pitch content or pitch-specific UI until Pitches gets its `TopNav` entry. When touching a shared surface, check whether it already renders pitches unconditionally before adding more.

**All API routes force-dynamic**: Every route file exports `export const dynamic = 'force-dynamic'` to disable Next.js caching.

### Authentication

NextAuth v4 (credentials + optional Azure AD SSO, JWT sessions); config in `src/lib/auth.ts`, route protection in `middleware.ts`. Session user shape: `{ id, name, email, appRole, personId }`.

**Azure AD SSO** (optional): When `AZURE_AD_CLIENT_ID` is set, the login page shows a "Sign in with Microsoft" button. SSO users are matched by email to existing `User` records or auto-created as `PRODUCER` if they belong to the Azure AD group specified by `AZURE_AD_ALLOWED_GROUP_ID`. The `passwordHash` field is nullable — SSO-only users have no password. See `docs/azure-sso-setup.md` for Azure Portal configuration.

### Data model gotchas (schema: `prisma/schema.prisma`)

- `Story.aiContributed` is a compliance flag and stays boolean. `Story.version` / `Video.version` are optimistic-locking counters. `Story.workingDraftUrl` (link to in-progress draft doc) is hidden from cards once the story is published.
- `StoryTag.tag` is `StoryTagEnum` (editorial indicators) — add new ones by extending the enum + `INDICATOR_OPTIONS` in `src/lib/utils.ts`; no migration needed.
- `Comment` has `storyId` **or** `videoId` (exactly one — enforced by the API, not Prisma). `authorName` is denormalized so deleted users (`authorId` is `SetNull`) keep a byline; `CommentMention` is the authoritative record of who was @-tagged.
- Story and Video have performance indexes on `(status, onlinePubDate)` and `(isEnterprise, status)`.

**Note:** `Visual.personId` credits a person on a story outside of `StoryAssignment`. `notifyStoryTeam` and `/api/people/[id]/content` include these credits as recipients/content; `/api/teams/[id]/content` does not yet (tracked in #21).

**Gotcha:** `PersonContentItem[]` (from `/api/people/[id]/content`, `/api/teams/[id]/content`) can contain multiple items for the same `type`+`id` (e.g. a person assigned REPORTER *and* credited on a PHOTO visual for the same story). Always key list rows by `${type}-${id}-${role}`, never `${type}-${id}` alone.

### Conventions and route notes

- Client `fetch` URLs go through `apiPath()` (`src/lib/api-path.ts`), which prepends `NEXT_PUBLIC_BASE_PATH`. Route handlers use `checkWriteLimit()`/`checkReadLimit()`/`requireJSON()` from `src/lib/api-helpers.ts`; the rate limiter (`src/lib/rate-limit.ts`) is in-memory, per-user, per-instance.
- `src/lib/budget-query.ts` holds the shared team-scoping helpers (`parsePersonIds()` etc.) used by `/api/budget/daily`, `/api/budget/agenda`, `ColumnsView`, and `AgendaView`; both budget routes take an optional comma-separated `personIds`.
- `AssignmentSection.tsx` is shared by story and video detail views (`parentType: "story" | "video"`); `AgendaView.tsx` is shared by Daily and Team schedule views.
- All routes return `400` (Zod validation), `404` (not found), `409` (P2002 unique constraint), `500` (server error). `/api/admin/**` is admin-only. `PATCH/DELETE /api/comments/[id]`: edit is author-only, delete is author or ADMIN. `/api/stories/[id]/unclaim`: self, or anyone with elevated access removing someone else's.
- `/api/cron/purge-shelved` requires `Authorization: Bearer CRON_SECRET`: it shelves expired, unclaimed pitches (`pitchedAt` kept for recovery), then purges stories/videos shelved 90+ days.

### SWR gotcha

**SWR hooks return `[]`/`undefined` while loading, not just when empty** — code deriving "is this id still valid" from a hook's list (e.g. `usePeople()`) must check the hook's `isLoading` flag first, or a cold cache reads as "nothing exists" and can silently strip valid state (e.g. mention pruning in `MentionTextarea.tsx`).

### Seed data

All seed pub times are stored as "newsroom time encoded as UTC" (e.g., 7:30 AM newsroom = `07:30:00.000Z`) via the helper `d(offsetDays, hour)` in `prisma/seed.ts`. Two seed staff link to user accounts: Sam Okafor → `admin@newsroom.com`, Jamie Rivera → `director@newsroom.com`.

### Staffing schedule (issue #19, dark-launched)

A layer tracking who's working, off, or half-day on any date, plus weekend/holiday shift roles — intended to eventually replace the PTO spreadsheet. Phases 1–4 are implemented; **there is no `TopNav` entry yet** — every route is reachable only by direct URL, and the spreadsheet stays the system of record until a later, separate commit adds the nav link.

Full detail (models, `resolveDay()` precedence, permissions, API routes, SWR hooks, client routes, shared components) is in **[`docs/staffing-schedule.md`](docs/staffing-schedule.md)** — load it before touching anything under `src/lib/schedule.ts`, `src/app/api/schedule/**`, `src/app/api/people/[id]/(availability|work-schedule)`, `src/app/schedule/**`, `src/app/admin/calendar`, or `src/components/schedule/**`.

### Feature Flags (`src/lib/features.ts`)

- `VIDEOS_ENABLED` (`NEXT_PUBLIC_VIDEOS_ENABLED`, default `true`): when `false`, hides all standalone video UI — "New Video" buttons, the Videos toggle on the daily view, the shelved-videos section, video results in search, and video rows in Me/Teams views. `/videos/new` and `/videos/[id]` redirect to `/`. Videos linked to stories remain in the DB but are not surfaced.
- `PITCHES_ENABLED` (`NEXT_PUBLIC_PITCHES_ENABLED`, default `false`): hides the "Pitches" nav entry only. The API routes and `/budget/pitches` page still work directly by URL — this flag exists to keep the feature isolated from the nav while it's still being built out (issue #24), not to actually gate access.

**Important**: `NEXT_PUBLIC_VIDEOS_ENABLED` is baked into the client bundle at build time. Toggling it requires a full rebuild — changing the env var in a hosting dashboard and redeploying without a rebuild will update server-side redirects but leave the client UI unchanged.

**When `VIDEOS_ENABLED=false`**: the `VIDEO` option remains available in the Visuals section on story detail pages as a lightweight substitute — editors can tag a visual element as type `VIDEO` to note that video coverage exists for a story without creating a full standalone video record.

### Environment Variables

See `.env.example` for the full template and `docs/azure-sso-setup.md` for Azure Portal configuration. Non-obvious bits: `BASE_PATH` (optional subpath deployment, e.g. `/news-budget`) mirrors to `NEXT_PUBLIC_BASE_PATH` for fetch calls; `CRON_SECRET` must also be set in the `vercel.json` cron config; email goes through a local postfix relay (`SMTP_HOST` default `localhost:25`, no auth) and is disabled when the SMTP vars are omitted; SSO is disabled when `AZURE_AD_CLIENT_ID` is omitted.
