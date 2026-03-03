# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server at http://localhost:3000 (Turbopack)
npm run build            # Production build
npm run lint             # ESLint

npx prisma studio        # Database browser UI
npx prisma db seed       # Re-seed (runs prisma/seed.ts via ts-node)
npx prisma migrate dev   # Apply schema changes and regenerate client
```

No test suite exists yet.

## Architecture Overview

**News budget management app** for tracking editorial stories and videos across daily/enterprise/edition/shelved views with drag-and-drop scheduling.

### Tech Stack
- **Next.js 16 App Router** with Turbopack, React 19
- **Prisma 5.22 + SQLite** — use Prisma 5 (NOT v7; v7 broke SQLite with driver adapters)
- **Zod v4** for validation — `z.string().cuid()`, `.flatten().fieldErrors` for errors
- **SWR** for client data fetching with optimistic DnD updates
- **@dnd-kit/core + @dnd-kit/sortable** for drag-and-drop
- **shadcn/ui** (new-york style) + Tailwind 4 + Radix UI

### Key Design Decisions

**Enums as Strings**: SQLite doesn't support Prisma enums, so all enum-like fields (`status`, `role`, `type`, `defaultRole`) are `String` in the DB schema. Zod schemas in `src/lib/validations.ts` enforce valid values at the API layer.

**No server components for data**: Pages are thin wrappers; data fetching is client-side via SWR hooks in `src/lib/hooks/`. The pattern is: `page.tsx` → `*Wrapper.tsx` (fetches data) → `*View.tsx` or `*Detail.tsx` (renders).

**Budget API returns grouped data**: `/api/budget/daily` returns content grouped by `TIME_BUCKET` (TBD/MORNING/MIDDAY/AFTERNOON/EVENING). `/api/budget/enterprise` groups by publication date. See `src/lib/utils.ts` for `dateToBucket()` logic.

### Data Models (prisma/schema.prisma)

- **Person**: Staff members with `defaultRole` (REPORTER/EDITOR/PHOTOGRAPHER/GRAPHIC_DESIGNER/PUBLICATION_DESIGNER/OTHER)
- **Story**: Content items with `slug`, `budgetLine`, `isEnterprise`, `status` (DRAFT/SCHEDULED/PUBLISHED_ITERATING/PUBLISHED_FINAL/SHELVED), online/print pub dates + TBD flags, `sortOrder`
- **StoryAssignment**: Join table (storyId, personId, role) — composite unique on all three
- **Visual**: Photo/graphic attached to a story, optionally assigned to a person
- **Video**: First-class content, optionally linked to a parent story via `storyId`
- **VideoAssignment**: Same pattern as StoryAssignment

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/utils.ts` | `cn()`, `TIME_BUCKETS`, `dateToBucket()`, `formatPubDate()`, `initials()`, status/role label maps |
| `src/lib/validations.ts` | All Zod schemas for API validation |
| `src/types/index.ts` | Prisma payload types: `StoryWithRelations`, `VideoWithRelations`, `PersonWithCounts`, `ContentItem` union |
| `src/lib/prisma.ts` | Prisma singleton (global pattern for hot-reload safety) |
| `prisma/seed.ts` | 15-day seed with 7 people, ~40 stories, ~30 videos |

### API Routes (`src/app/api/`)

- `budget/daily?date=YYYY-MM-DD` — stories+videos grouped by time bucket
- `budget/enterprise`, `budget/edition`, `budget/agenda` — alternate views
- `stories/` + `stories/[id]/` — CRUD, plus `/assignments` and `/visuals` sub-routes
- `videos/` + `videos/[id]/` — CRUD, plus `/assignments` sub-route
- `people/` + `people/[id]/` — CRUD, plus `/content` sub-route
- `visuals/[id]/` — update/delete individual visuals
- `search?q=` — full-text search across stories and videos

API routes return 409 on Prisma unique constraint errors (P2002), 400 for Zod validation failures, 404 for not-found.

### Client Routing (`src/app/`)

- `/` → redirects to `/budget/daily/{today}`
- `/budget/daily/[date]` — daily time-slot view with DnD
- `/budget/enterprise` — enterprise stories/videos grouped by date
- `/budget/edition` — print edition view
- `/budget/shelved` — shelved content
- `/stories/[id]` and `/stories/new` — story detail/create
- `/videos/[id]` and `/videos/new` — video detail/create
- `/people` and `/people/[id]` — staff management
