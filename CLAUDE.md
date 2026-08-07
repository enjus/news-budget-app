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

If `npm run build` or `tsc --noEmit` fails with "Cannot find module" for a package that *is* in `package.json` (e.g. `nodemailer`), `node_modules` has drifted — run `npm install` first.

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

**Off-budget draft privacy is per-route, not centralized**: Story/Video routes gate access with `if (!parent.onBudget && parent.createdByUserId !== session.user.id && !hasAdminAccess(...))` → 404. There's no shared middleware/helper enforcing this — any new route touching a Story/Video or its child resources (comments, visuals, assignments) must replicate the check explicitly, including selecting `onBudget`/`createdByUserId` in the query.

**TBD content**: Items without a publication time have `onlinePubDateTBD: true` and float in a TBD bucket. A `TBD_CAP` (500) prevents unbounded queries.

**"Today" boundary**: Always use `todayString()` (`src/lib/utils.ts`, Pacific-time) to compute "today" for upcoming/past splits — never `format(new Date(), "yyyy-MM-dd")` or other browser-local-time formatting. Mixing the two causes near-midnight categorization bugs when client and server disagree on the boundary.

**Comment timestamps vs. pub dates**: `formatPubDate()` reads `getUTC*` because pub times are "newsroom time encoded as UTC". A `Comment.createdAt` is a *genuine* instant, so it must be formatted with `formatTimestampPacific()` (Intl + `America/Los_Angeles`) instead — using `formatPubDate()` on it would display the wrong time.

**Comment notifications**: @-mentioned People are always emailed. "Post and Notify All" additionally emails everyone assigned to the item, minus anyone already emailed as a mention and minus the comment's author. Editing a comment sends nothing.

**All API routes force-dynamic**: Every route file exports `export const dynamic = 'force-dynamic'` to disable Next.js caching.

### Authentication

**Middleware** (`middleware.ts`): NextAuth `withAuth` protects all routes except `/login` and `/api/auth/*`. Unauthenticated requests redirect to `/login`.

**User model** fields:
- `appRole`: `ADMIN` | `LEADERSHIP` | `MANAGING_PRODUCER` | `SUPERVISOR` | `PRODUCER` | `VIEWER`
- `personId`: optional link to a `Person` (staff member)

**Session shape** (available via `useSession()`):
```typescript
{ user: { id, name, email, appRole, personId } }
```

**Auth config** lives in `src/lib/auth.ts` (CredentialsProvider + AzureADProvider, JWT strategy, callbacks to populate appRole/personId).

**Azure AD SSO** (optional): When `AZURE_AD_CLIENT_ID` is set, the login page shows a "Sign in with Microsoft" button. SSO users are matched by email to existing `User` records or auto-created as `PRODUCER` if they belong to the Azure AD group specified by `AZURE_AD_ALLOWED_GROUP_ID`. The `passwordHash` field is nullable — SSO-only users have no password. See `docs/azure-sso-setup.md` for Azure Portal configuration.

### Data Models (prisma/schema.prisma)

| Model | Key Fields |
|-------|-----------|
| **User** | `id`, `email` (unique), `name`, `passwordHash` (nullable — SSO-only users have none), `appRole` (ADMIN\|LEADERSHIP\|MANAGING_PRODUCER\|SUPERVISOR\|PRODUCER\|VIEWER), `personId` (optional FK → Person) |
| **Person** | `id`, `name`, `email` (unique), `defaultRole` (REPORTER\|EDITOR\|PHOTOGRAPHER\|GRAPHIC_DESIGNER\|PUBLICATION_DESIGNER\|OTHER) |
| **Story** | `id`, `slug`, `budgetLine`, `isEnterprise`, `status` (DRAFT\|SCHEDULED\|PUBLISHED_ITERATING\|PUBLISHED_FINAL\|SHELVED), `onlinePubDate`, `onlinePubDateTBD`, `printPubDate`, `printPubDateTBD`, `notes`, `wordCount`, `notifyTeam`, `aiContributed`, `hereIsOregon`, `contentRemix`, `summerFocus`, `oregonInsight` (boolean flags), `onBudget`, `sortOrder`, `shelvedAt`, `postUrl`, `createdByUserId` (FK → User), `version` (optimistic locking) |
| **StoryAssignment** | `storyId`, `personId`, `role` (REPORTER\|EDITOR\|OTHER) — composite unique on all three |
| **Visual** | `storyId`, `type` (PHOTO\|GRAPHIC\|MAP), `description`, `personId` (optional) |
| **Video** | `id`, `slug`, `budgetLine`, `isEnterprise`, `status`, `storyId` (optional—standalone or linked), `onlinePubDate`, `onlinePubDateTBD`, `notes`, `notifyTeam`, `aiContributed`, `sortOrder`, `shelvedAt`, `version` (optimistic locking), `youtubeUrl`, `reelsUrl`, `tiktokUrl`, `otherUrl` |
| **VideoAssignment** | `videoId`, `personId`, `role` (REPORTER\|EDITOR\|VIDEOGRAPHER\|OTHER) — composite unique on all three |
| **Team** | `id`, `name` (unique), `description` |
| **TeamMember** | `teamId`, `personId`, `role` (EDITOR\|MEMBER) — unique on (teamId, personId) |
| **Comment** | `id`, `body` (plain text), `storyId` **or** `videoId` (exactly one — enforced by the API, not Prisma), `authorId` (FK → User, `SetNull`), `authorName` (denormalized so deleted users keep a byline), `editedAt`, `createdAt` |
| **CommentMention** | `commentId`, `personId` — unique on (commentId, personId); the authoritative record of who was @-tagged |

**Performance indexes** on Story and Video: `(status, onlinePubDate)`, `(isEnterprise, status)`.

### Important Files

| File | Purpose |
|------|---------|
| `src/lib/utils.ts` | `cn()`, `TIME_BUCKETS`, `dateToBucket()`, `formatPubDate()`, `formatPrintDate()`, `todayString()`, `formatTimestampPacific()`, `initials()`, `surname()`, status/role label maps |
| `src/lib/budget-query.ts` | `parsePersonIds()`, `personAssignmentFilter()`, `personIdsQueryParts()` — shared team-scoping helpers used by `/api/budget/daily`, `/api/budget/agenda`, `ColumnsView`, `AgendaView` |
| `src/lib/validations.ts` | All Zod schemas: `createStorySchema`, `updateStorySchema`, `createVideoSchema`, `updateVideoSchema`, `createPersonSchema`, `updatePersonSchema`, `createAssignmentSchema`, `createVisualSchema`, etc. |
| `src/types/index.ts` | Prisma payload types: `StoryWithRelations`, `StoryListItem`, `EnterpriseStoryItem`, `VideoWithRelations`, `PersonWithCounts`, `ContentItem` union, `DailyBudgetSlot`, `EnterpriseDateGroup`, `EditionDateGroup` |
| `src/lib/prisma.ts` | Prisma singleton (global pattern for hot-reload safety) |
| `src/lib/auth.ts` | NextAuth configuration (CredentialsProvider + AzureADProvider, JWT callbacks, SSO group check) |
| `src/lib/email.ts` | nodemailer transport (localhost:25 postfix relay, no auth) |
| `src/lib/notifications.ts` | Story/video change + comment email notifications to assigned staff |
| `src/lib/comments.ts` | `commentInclude`, `commentOrderBy`, and the `listComments()` / `createComment()` handlers shared by the story and video comment routes |
| `src/lib/comment-text.ts` | `tokenizeCommentBody()` (React tokens: text/link/mention), `linkifyToHtml()` (email HTML) — comment bodies are plain text, linkified at render time |
| `src/lib/rate-limit.ts` | In-memory sliding-window rate limiter (per-user, per-instance) |
| `src/lib/api-path.ts` | `apiPath()` — prepends `NEXT_PUBLIC_BASE_PATH` to client fetch URLs |
| `src/lib/api-helpers.ts` | `checkWriteLimit()`, `checkReadLimit()`, `requireJSON()` route helpers |
| `middleware.ts` | NextAuth `withAuth` middleware — protects all routes |
| `prisma/seed.ts` | 15-day seed with 9 people, ~40 stories, ~30 videos, 2 user accounts |

### Enum Valid Values (Zod enforced)

| Field | Valid values |
|-------|-------------|
| `PersonRole` / `defaultRole` | REPORTER, EDITOR, PHOTOGRAPHER, VIDEOGRAPHER, GRAPHIC_DESIGNER, PUBLICATION_DESIGNER, OTHER |
| `AssignmentRole` (story) | REPORTER, EDITOR, OTHER |
| `VideoAssignmentRole` | REPORTER, EDITOR, VIDEOGRAPHER, OTHER |
| `VisualType` | PHOTO, GRAPHIC, MAP, VIDEO |
| `StoryStatus` / `VideoStatus` | DRAFT, SCHEDULED, PUBLISHED_ITERATING, PUBLISHED_FINAL, SHELVED |
| `AppRole` (User) | ADMIN, LEADERSHIP, MANAGING_PRODUCER, SUPERVISOR, PRODUCER, VIEWER |
| `TeamRole` | EDITOR, MEMBER |

### API Routes (`src/app/api/`)

All routes return `400` (Zod validation), `404` (not found), `409` (P2002 unique constraint), `500` (server error).

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler |
| `/api/budget/daily?date=YYYY-MM-DD&personIds=` | GET | Stories+videos grouped by TIME_BUCKETS; optional comma-separated `personIds` scopes to assignees (team views) |
| `/api/budget/enterprise` | GET | Enterprise stories+videos grouped by week |
| `/api/budget/edition` | GET | Stories grouped by print pub date |
| `/api/budget/agenda?start=&personIds=` | GET | Agenda view; optional `personIds` scopes to assignees (team views) |
| `/api/search?q=` | GET | Full-text search across stories/videos |
| `/api/stories` | GET/POST | List/create stories |
| `/api/stories/[id]` | GET/PUT/DELETE | Story CRUD |
| `/api/stories/[id]/assignments` | GET/POST | Story staff assignments |
| `/api/stories/[id]/visuals` | GET/POST | Story visuals |
| `/api/videos` | GET/POST | List/create videos |
| `/api/videos/[id]` | GET/PUT/DELETE | Video CRUD |
| `/api/videos/[id]/assignments` | GET/POST | Video staff assignments |
| `/api/visuals/[id]` | PUT/DELETE | Update/delete individual visual |
| `/api/stories/[id]/comments` | GET/POST | Story comments; POST body `{ body, mentionIds?, notifyAll? }` |
| `/api/videos/[id]/comments` | GET/POST | Video comments (same shape) |
| `/api/comments/[id]` | PATCH/DELETE | Edit (author only) / delete (author or ADMIN) a comment |
| `/api/people` | GET/POST | List/create staff |
| `/api/people/[id]` | GET/PUT/DELETE | Person CRUD |
| `/api/people/[id]/content` | GET | Content assigned to a person |
| `/api/admin/users` | GET/POST | List/create app users (admin only) |
| `/api/admin/users/[id]` | GET/PUT/DELETE | User CRUD (admin only) |
| `/api/drafts` | GET | Current user's draft stories + videos |
| `/api/teams/[id]` | GET/PUT/DELETE | Team CRUD |
| `/api/teams/[id]/content` | GET | Content assigned to a team |
| `/api/teams/my` | GET | Teams the current user belongs to |
| `/api/cron/purge-shelved` | GET | Purge stories/videos shelved 90+ days (requires `Authorization: Bearer CRON_SECRET`) |

### SWR Hooks (`src/lib/hooks/`)

| Hook | Purpose |
|------|---------|
| `useStories(params?)` | Fetch stories (filters: status, enterprise, date) |
| `useStory(id)` | Fetch single story by ID |
| `useVideos(params?)` | Fetch videos (filters: status, storyId, standalone, enterprise) |
| `usePeople(role?)` | Fetch staff (optional role filter) |
| `usePreferences()` | Client-side localStorage for view preferences (defaultView, contentDefault) |
| `useDrafts()` | Fetch current user's draft stories + videos |
| `useMyTeams()` | Fetch teams the current user belongs to |
| `useTeams()` | Fetch all teams (admin use) |
| `useTeamContent(teamId)` | Fetch content assigned to a team |

**SWR hooks return `[]`/`undefined` while loading, not just when empty** — code deriving "is this id still valid" from a hook's list (e.g. `usePeople()`) must check the hook's `isLoading` flag first, or a cold cache reads as "nothing exists" and can silently strip valid state (e.g. mention pruning in `MentionTextarea.tsx`).

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
| `/me` | Current user's assigned content |
| `/teams` | Teams view — Columns/Agenda (team-filtered Daily/Agenda) + Members tabs |
| `/settings` | User preferences (view/layout defaults) |
| `/admin/users` | Admin: manage app users |

### Component Structure (`src/components/`)

| Directory | Key Components |
|-----------|--------------|
| `auth/` | LoginForm.tsx |
| `budget/` | StoryCard.tsx, VideoCard.tsx, ColumnsView.tsx, AgendaView.tsx (shared by Daily and Team schedule views) |
| `dnd/` | DndProvider.tsx, SortableCard.tsx |
| `layout/` | TopNav.tsx, SearchCommand.tsx (Cmd+K), BudgetTabNav.tsx |
| `people/` | PersonBadge.tsx, PersonForm.tsx, PersonList.tsx, PersonPicker.tsx |
| `providers/` | SWRProvider.tsx, SessionProvider.tsx, ThemeProvider.tsx |
| `story/` | StoryDetail.tsx, StoryForm.tsx, AssignmentSection.tsx, VisualSection.tsx, StoryVideoSection.tsx, VideoDetail.tsx, VideoForm.tsx, VideoAssignmentSection.tsx, CommentSection.tsx, MentionTextarea.tsx |
| `ui/` | 20+ shadcn/ui components (button, card, dialog, input, select, date-time-picker, etc.) |

Root layout (`src/app/layout.tsx`) wraps: `SessionProvider` → `ThemeProvider` → `SWRProvider` → `TopNav` + `Toaster`.

### Prisma Seed (`prisma/seed.ts`)

Seeds 15-day historical budget + enterprise stories extending 180 days forward.

**9 staff members** (2 linked to user accounts):
- Alice Chen (REPORTER), Bob Martinez (EDITOR), Carol Williams (REPORTER), David Kim (PHOTOGRAPHER), Elena Patel (GRAPHIC_DESIGNER), Frank Johnson (EDITOR), Maya Singh (VIDEOGRAPHER), Sam Okafor (EDITOR → `admin@newsroom.com`), Jamie Rivera (EDITOR → `director@newsroom.com`)

**Date encoding**: All pub times stored as "newsroom time encoded as UTC" (e.g., 7:30 AM newsroom = `07:30:00.000Z`). The seed helper `d(offsetDays, hour)` constructs these dates.

### Feature Flags (`src/lib/features.ts`)

| Flag | Env var | Default | Effect when `false` |
|------|---------|---------|---------------------|
| `VIDEOS_ENABLED` | `NEXT_PUBLIC_VIDEOS_ENABLED` | `true` | Hides all standalone video UI: "New Video" buttons, the Videos toggle on the daily view, the shelved-videos section, video results in search, and video rows in Me/Teams views. `/videos/new` and `/videos/[id]` redirect to `/`. Videos linked to stories remain in the DB but are not surfaced. |

**Important**: `NEXT_PUBLIC_VIDEOS_ENABLED` is baked into the client bundle at build time. Toggling it requires a full rebuild — changing the env var in a hosting dashboard and redeploying without a rebuild will update server-side redirects but leave the client UI unchanged.

**Activating standalone video** (re-enabling after it has been hidden):
1. Set `NEXT_PUBLIC_VIDEOS_ENABLED=true` in your environment (or remove the variable — it defaults to `true`).
2. Rebuild and redeploy (`npm run build`).

**When `VIDEOS_ENABLED=false`**: the `VIDEO` option remains available in the Visuals section on story detail pages as a lightweight substitute — editors can tag a visual element as type `VIDEO` to note that video coverage exists for a story without creating a full standalone video record.

### Environment Variables

```bash
DATABASE_URL=                  # PostgreSQL connection string
NEXTAUTH_SECRET=               # Random secret for JWT signing
NEXTAUTH_URL=                  # App base URL (e.g., http://localhost:3000)

# Subpath deployment (optional — omit for root deployment)
BASE_PATH=                     # e.g. /news-budget — mirrors to NEXT_PUBLIC_BASE_PATH for fetch calls

# Email notifications (optional — omit to disable)
SMTP_HOST=                     # Mail relay host (default: localhost)
SMTP_PORT=                     # Mail relay port (default: 25)
MAIL_FROM=                     # From address (default: News Budget <newsbudget-noreply@oregonian.com>)
APP_PUBLIC_URL=                # Public app URL for links in notification emails

# Cron jobs
CRON_SECRET=                   # Bearer token for /api/cron/* routes (set in vercel.json cron config too)

# Azure AD SSO (optional — omit AZURE_AD_CLIENT_ID to disable)
AZURE_AD_CLIENT_ID=            # Azure App Registration client ID
AZURE_AD_CLIENT_SECRET=        # Azure App Registration client secret
AZURE_AD_TENANT_ID=            # Azure AD tenant ID
AZURE_AD_ALLOWED_GROUP_ID=     # Object ID of the security group that grants SSO access
```

See `.env.example` for the full template. See `docs/azure-sso-setup.md` for Azure Portal configuration.
