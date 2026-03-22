# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server at http://localhost:3000 (Turbopack)
npm run build            # Production build (prisma generate + db push + next build)
npm run start            # Production server
npm run lint             # ESLint

npx prisma studio        # Database browser UI
npx prisma db seed       # Re-seed (runs prisma/seed.ts via ts-node)
npx prisma migrate dev   # Apply schema changes and regenerate client
npx prisma generate      # Regenerate Prisma client (runs automatically via postinstall)
```

No test suite exists yet.

## Architecture Overview

**News budget management app** for tracking editorial stories and videos across daily/enterprise/edition/shelved views with drag-and-drop scheduling.

### Tech Stack

- **Next.js 16 App Router** with Turbopack, React 19
- **Prisma 5.22 + PostgreSQL** — use Prisma 5 (NOT v7; v7 broke SQLite with driver adapters). `DATABASE_URL` in `.env`.
- **NextAuth v4** — credentials + Azure AD SSO auth, JWT sessions, middleware protection
- **Zod v4** for validation — `z.string().cuid()`, `.flatten().fieldErrors` for errors
- **SWR v2** for client data fetching with optimistic DnD updates
- **@dnd-kit/core + @dnd-kit/sortable** for drag-and-drop
- **shadcn/ui** (new-york style) + Tailwind 4 + Radix UI
- **next-themes** for dark/light mode
- **sonner** for toast notifications
- **bcryptjs** for password hashing
- **date-fns v4** for date manipulation
- **react-hook-form + @hookform/resolvers** for form state

### Key Design Decisions

**Enums as Strings**: All enum-like fields (`status`, `role`, `type`, `defaultRole`, `appRole`) are stored as `String` in the DB schema. Zod schemas in `src/lib/validations.ts` enforce valid values at the API layer. This preserves flexibility for migrations.

**No server components for data**: Pages are thin wrappers; data fetching is client-side via SWR hooks in `src/lib/hooks/`. The pattern is: `page.tsx` → `*Wrapper.tsx` (fetches data) → `*View.tsx` or `*Detail.tsx` (renders).

**Budget API returns grouped data**: `/api/budget/daily` returns content grouped by `TIME_BUCKET` (TBD/MORNING/MIDDAY/AFTERNOON/EVENING). `/api/budget/enterprise` groups by week (Monday). `/api/budget/edition` groups by print publication date. See `src/lib/utils.ts` for `dateToBucket()` logic.

**Optimistic drag-and-drop**: dnd-kit updates local SWR cache immediately on drop; server PATCH confirms persistence. `sortOrder` field on Story/Video drives ordering.

**TBD content**: Items without a publication time have `onlinePubDateTBD: true` and float in a TBD bucket. A `TBD_CAP` (500) prevents unbounded queries.

**All API routes force-dynamic**: Every route file exports `export const dynamic = 'force-dynamic'` to disable Next.js caching.

### Authentication

**Middleware** (`middleware.ts`): NextAuth `withAuth` protects all routes except `/login` and `/api/auth/*`. Unauthenticated requests redirect to `/login`.

**User model** fields:
- `appRole`: `ADMIN` | `EDITOR` | `VIEWER`
- `personId`: optional link to a `Person` (staff member)

**Session shape** (available via `useSession()`):
```typescript
{ user: { id, name, email, appRole, personId } }
```

**Auth config** lives in `src/lib/auth.ts` (CredentialsProvider + AzureADProvider, JWT strategy, callbacks to populate appRole/personId).

**Azure AD SSO** (optional): When `AZURE_AD_CLIENT_ID` is set, the login page shows a "Sign in with Microsoft" button. SSO users are matched by email to existing `User` records or auto-created as `VIEWER` if they belong to the Azure AD group specified by `AZURE_AD_ALLOWED_GROUP_ID`. The `passwordHash` field is nullable — SSO-only users have no password. See `docs/azure-sso-setup.md` for Azure Portal configuration.

### Data Models (prisma/schema.prisma)

| Model | Key Fields |
|-------|-----------|
| **User** | `id`, `email` (unique), `name`, `passwordHash` (nullable — SSO-only users have none), `appRole` (ADMIN\|EDITOR\|VIEWER), `personId` (optional FK → Person) |
| **Person** | `id`, `name`, `email` (unique), `defaultRole` (REPORTER\|EDITOR\|PHOTOGRAPHER\|GRAPHIC_DESIGNER\|PUBLICATION_DESIGNER\|OTHER) |
| **Story** | `id`, `slug`, `budgetLine`, `isEnterprise`, `status` (DRAFT\|SCHEDULED\|PUBLISHED_ITERATING\|PUBLISHED_FINAL\|SHELVED), `onlinePubDate`, `onlinePubDateTBD`, `printPubDate`, `printPubDateTBD`, `notes`, `wordCount`, `notifyTeam`, `aiContributed`, `sortOrder`, `shelvedAt`, `postUrl` |
| **StoryAssignment** | `storyId`, `personId`, `role` (REPORTER\|EDITOR\|OTHER) — composite unique on all three |
| **Visual** | `storyId`, `type` (PHOTO\|GRAPHIC\|MAP), `description`, `personId` (optional) |
| **Video** | `id`, `slug`, `budgetLine`, `isEnterprise`, `status`, `storyId` (optional—standalone or linked), `onlinePubDate`, `onlinePubDateTBD`, `notes`, `notifyTeam`, `aiContributed`, `sortOrder`, `shelvedAt`, `youtubeUrl`, `reelsUrl`, `tiktokUrl`, `otherUrl` |
| **VideoAssignment** | `videoId`, `personId`, `role` (REPORTER\|EDITOR\|VIDEOGRAPHER\|OTHER) — composite unique on all three |

**Performance indexes** on Story and Video: `(status, onlinePubDate)`, `(isEnterprise, status)`.

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/utils.ts` | `cn()`, `TIME_BUCKETS`, `dateToBucket()`, `formatPubDate()`, `formatPrintDate()`, `todayString()`, `initials()`, `surname()`, status/role label maps |
| `src/lib/validations.ts` | All Zod schemas: `createStorySchema`, `updateStorySchema`, `createVideoSchema`, `updateVideoSchema`, `createPersonSchema`, `updatePersonSchema`, `createAssignmentSchema`, `createVisualSchema`, etc. |
| `src/types/index.ts` | Prisma payload types: `StoryWithRelations`, `StoryListItem`, `EnterpriseStoryItem`, `VideoWithRelations`, `PersonWithCounts`, `ContentItem` union, `DailyBudgetSlot`, `EnterpriseDateGroup`, `EditionDateGroup` |
| `src/lib/prisma.ts` | Prisma singleton (global pattern for hot-reload safety) |
| `src/lib/auth.ts` | NextAuth configuration (CredentialsProvider + AzureADProvider, JWT callbacks, SSO group check) |
| `middleware.ts` | NextAuth `withAuth` middleware — protects all routes |
| `prisma/seed.ts` | 15-day seed with 9 people, ~40 stories, ~30 videos, 2 user accounts |

### Enum Valid Values (Zod enforced)

| Field | Valid values |
|-------|-------------|
| `PersonRole` / `defaultRole` | REPORTER, EDITOR, PHOTOGRAPHER, VIDEOGRAPHER, GRAPHIC_DESIGNER, PUBLICATION_DESIGNER, OTHER |
| `AssignmentRole` (story) | REPORTER, EDITOR, OTHER |
| `VideoAssignmentRole` | REPORTER, EDITOR, VIDEOGRAPHER, OTHER |
| `VisualType` | PHOTO, GRAPHIC, MAP |
| `StoryStatus` / `VideoStatus` | DRAFT, SCHEDULED, PUBLISHED_ITERATING, PUBLISHED_FINAL, SHELVED |
| `AppRole` (User) | ADMIN, EDITOR, VIEWER |

### API Routes (`src/app/api/`)

All routes return `400` (Zod validation), `404` (not found), `409` (P2002 unique constraint), `500` (server error).

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler |
| `/api/budget/daily?date=YYYY-MM-DD` | GET | Stories+videos grouped by TIME_BUCKETS |
| `/api/budget/enterprise` | GET | Enterprise stories+videos grouped by week |
| `/api/budget/edition` | GET | Stories grouped by print pub date |
| `/api/budget/agenda` | GET | Agenda view |
| `/api/search?q=` | GET | Full-text search across stories/videos |
| `/api/stories` | GET/POST | List/create stories |
| `/api/stories/[id]` | GET/PUT/DELETE | Story CRUD |
| `/api/stories/[id]/assignments` | GET/POST | Story staff assignments |
| `/api/stories/[id]/visuals` | GET/POST | Story visuals |
| `/api/videos` | GET/POST | List/create videos |
| `/api/videos/[id]` | GET/PUT/DELETE | Video CRUD |
| `/api/videos/[id]/assignments` | GET/POST | Video staff assignments |
| `/api/visuals/[id]` | PUT/DELETE | Update/delete individual visual |
| `/api/people` | GET/POST | List/create staff |
| `/api/people/[id]` | GET/PUT/DELETE | Person CRUD |
| `/api/people/[id]/content` | GET | Content assigned to a person |
| `/api/admin/users` | GET/POST | List/create app users (admin only) |
| `/api/admin/users/[id]` | GET/PUT/DELETE | User CRUD (admin only) |

### SWR Hooks (`src/lib/hooks/`)

| Hook | Purpose |
|------|---------|
| `useStories(params?)` | Fetch stories (filters: status, enterprise, date) |
| `useStory(id)` | Fetch single story by ID |
| `useVideos(params?)` | Fetch videos (filters: status, storyId, standalone, enterprise) |
| `usePeople(role?)` | Fetch staff (optional role filter) |
| `usePreferences()` | Client-side localStorage for view preferences (defaultView, contentDefault) |

### Client Routing (`src/app/`)

| Route | Purpose |
|-------|---------|
| `/` | Redirect to default view (daily/enterprise/edition based on preferences) |
| `/login` | Login form (credentials + optional Azure AD SSO) |
| `/budget/daily/[date]` | Daily time-slot view with DnD |
| `/budget/enterprise` | Enterprise stories/videos grouped by week |
| `/budget/edition` | Print edition view |
| `/budget/shelved` | Shelved content (auto-deletes after 90 days) |
| `/stories/new` | Create new story |
| `/stories/[id]` | Story detail/edit with assignments, visuals, linked videos |
| `/videos/new` | Create new video |
| `/videos/[id]` | Video detail/edit with assignments |
| `/people` | Staff directory |
| `/people/[id]` | Person detail with assigned content |
| `/settings` | User preferences (view/layout defaults) |
| `/admin/users` | Admin: manage app users |

### Component Structure (`src/components/`)

| Directory | Key Components |
|-----------|--------------|
| `auth/` | LoginForm.tsx |
| `budget/` | StoryCard.tsx, VideoCard.tsx |
| `dnd/` | DndProvider.tsx, SortableCard.tsx |
| `layout/` | TopNav.tsx, SearchCommand.tsx (Cmd+K), BudgetTabNav.tsx |
| `people/` | PersonBadge.tsx, PersonForm.tsx, PersonList.tsx, PersonPicker.tsx |
| `providers/` | SWRProvider.tsx, SessionProvider.tsx, ThemeProvider.tsx |
| `story/` | StoryDetail.tsx, StoryForm.tsx, AssignmentSection.tsx, VisualSection.tsx, StoryVideoSection.tsx, VideoDetail.tsx, VideoForm.tsx, VideoAssignmentSection.tsx |
| `ui/` | 20+ shadcn/ui components (button, card, dialog, input, select, date-time-picker, etc.) |

Root layout (`src/app/layout.tsx`) wraps: `SessionProvider` → `ThemeProvider` → `SWRProvider` → `TopNav` + `Toaster`.

### Prisma Seed (`prisma/seed.ts`)

Seeds 15-day historical budget + enterprise stories extending 180 days forward.

**9 staff members** (2 linked to user accounts):
- Alice Chen (REPORTER), Bob Martinez (EDITOR), Carol Williams (REPORTER), David Kim (PHOTOGRAPHER), Elena Patel (GRAPHIC_DESIGNER), Frank Johnson (EDITOR), Maya Singh (VIDEOGRAPHER), Sam Okafor (EDITOR → `admin@newsroom.com`), Jamie Rivera (EDITOR → `director@newsroom.com`)

**Date encoding**: All pub times stored as "newsroom time encoded as UTC" (e.g., 7:30 AM newsroom = `07:30:00.000Z`). The seed helper `d(offsetDays, hour)` constructs these dates.

### Environment Variables

```bash
DATABASE_URL=                  # PostgreSQL connection string
NEXTAUTH_SECRET=               # Random secret for JWT signing
NEXTAUTH_URL=                  # App base URL (e.g., http://localhost:3000)

# Azure AD SSO (optional — omit AZURE_AD_CLIENT_ID to disable)
AZURE_AD_CLIENT_ID=            # Azure App Registration client ID
AZURE_AD_CLIENT_SECRET=        # Azure App Registration client secret
AZURE_AD_TENANT_ID=            # Azure AD tenant ID
AZURE_AD_ALLOWED_GROUP_ID=     # Object ID of the security group that grants SSO access
```

See `.env.example` for the full template. See `docs/azure-sso-setup.md` for Azure Portal configuration.
