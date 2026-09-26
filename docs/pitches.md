# Pitches (issue #24, dark-launched behind `PITCHES_ENABLED`)

Moved out of the root `CLAUDE.md` so it only loads when working on Pitches. The **Dark-launch rule** (no other tool or page surfaces pitch content until Pitches gets a `TopNav` entry) stays in the root `CLAUDE.md` because it applies whenever a shared surface is touched.

A newsroom-wide pool for tips and unassigned stories, built entirely on the `Story` model — a pitch is just `onBudget: false` with `pitchedAt` set (see the field list below); there's no separate Pitch table. Filing (`POST /api/pitches`) takes one field (`text`) and server-derives everything else: a placeholder `slug`/`budgetLine`, `status: DRAFT`, and `expiresAt` (7 days out unless `evergreen` or an explicit date — the same 7-day default applies to "Return to Pitches", unarchiving an expired pitch, and the Extend button). Claiming is deliberately split into two actions of different weight: `POST /api/stories/[id]/claim` just creates a `StoryAssignment` (single-claimant, enforced with a 409 rather than a DB constraint — good enough for this newsroom's concurrency, consistent with the app's optimistic-locking style elsewhere) and `POST /api/stories/[id]/unclaim` removes it; neither touches `onBudget`/`pitchedAt`. `POST /api/stories/[id]/send-to-budget` is the heavier action — it rewrites the placeholder `slug`/`budgetLine` into real ones and flips `onBudget: true`, clearing `pitchedAt`/`expiresAt` (`pitchText` persists as provenance). It deliberately does *not* require an existing claim — an editor can send an unclaimed pitch straight to budget, same as any other unassigned story. The `purge-shelved` cron auto-shelves expired, unclaimed pitches but leaves `pitchedAt` set so they stay recoverable via the story detail page's unarchive flow (a claimed pitch is excluded from that sweep). `GET /api/budget/pitches` uses an explicit `select` rather than `include` — pitch notes may carry a tipster's contact details, which shouldn't sit in every browser's memory for every open pitch.

## Story fields

- `pitchedAt` — non-null → the story is in the Pitches pool; `onBudget` must be false.
- `expiresAt` — pitch shelf-life deadline; null = evergreen.
- `pitchText` — the tip as filed; write-once, never accepted by `updateStorySchema`.

## Where the code lives

| Route / file | Purpose |
|---|---|
| `POST /api/pitches` | File a pitch |
| `GET /api/budget/pitches` | List the active pool (any authenticated user) |
| `POST /api/stories/[id]/claim`, `/unclaim` | Claim / drop a claim (unclaim: self, or anyone with elevated access removing someone else's) |
| `POST /api/stories/[id]/send-to-budget` | Promote a pitch onto the real budget |
| `/budget/pitches` | Pool page — nav entry gated behind `PITCHES_ENABLED`; reachable by direct URL either way |
| `usePitches()` | SWR hook for the pool |
| `PitchRow.tsx`, `PitchExpiryBadge.tsx`, `PitchDetail.tsx` | UI components |
