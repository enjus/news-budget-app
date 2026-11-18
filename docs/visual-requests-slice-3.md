# Visual requests — Slice 3 (dashboard, standalone requests, go-live)

Source: issue #23; builds on [`visual-requests-slice-1.md`](visual-requests-slice-1.md) and [`visual-requests-slice-2.md`](visual-requests-slice-2.md). Scope set by Elliot's answers of Nov 16 (decision log: "Elliot's answers", "Standalone requests"). Status: approved Nov 17 (all section 10 defaults), in progress (stage 1).

## Goal

Everything needed to turn `NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED` on in production:

1. A **`/requests` dashboard** where the visuals desk sees and works the queue.
2. **Standalone requests**: filed with no story, worked to delivered on their own, attached to a story later. ("Gov. Tina Kotek is speaking in Portland, update our file photos.")
3. A **request detail page** at `/requests/[id]`, the one place every lifecycle action happens.
4. **Attach to story** on a request, which also gives unplaced visuals (left by a story delete) somewhere to go.
5. **Email updates**: the desk email works without a story and links to the request page; the IN_PROGRESS story-delete notice points at the request.
6. A **hint on the New Story form** under Add Visual.
7. **Navigation** to the dashboard.
8. **Desk routing in the app** (added Nov 17, Elliot): an admin page to change where request emails go, without editing the server `.env`. Section 14.

## Out of scope

Calendar invites and `METHOD:REQUEST`/`CANCEL` (slice 4); requester confirmation on filing (slice 4); archive, unarchive and purge of visuals (the `archived` columns stay unused); comments on requests; a history/audit trail of status changes. The only schema change is the desk-routing table (section 14), in the second PR. Self-claim and requester emails are open questions (section 10), each with a proposed default.

## Repo conventions (unchanged from slices 1 and 2)

- Pure-function vitest tests only. No DB, network, route or component tests.
- Mutating routes call `checkWriteLimit()` and `requireJSON()`; client fetches go through `apiPath()`; every route exports `dynamic = 'force-dynamic'`.
- The flag hides UI entry points only. Routes and pages work by direct URL when it's off, so the desk can try the dashboard in production before go-live.
- Status rules live in `visual-statuses.ts`, permissions in `visual-requests.ts`. Readers use the helpers, never their own lists.
- PR 3a needs no `db push`: `storyId` is already nullable and every field it uses exists. PR 3b adds one table (section 14) and does need `npx prisma db push` on deploy.

## 1. Permissions

The slice 1 table stands (`canActOnVisual`, `canTransition`). Two additions, both in `src/lib/visual-requests.ts`:

**New action `attach`** (set or change `storyId`): the requester, the current assignee, or an elevated role. The assignee is included because the photographer often knows where the photo ended up. Not allowed on PLANNED (a credit always has a story) or on DECLINED / CANCELED (dead requests don't go on stories). Allowed on REQUESTED, ASSIGNED, IN_PROGRESS, DELIVERED.

**New pure helper `availableVisualActions(actor, visual)`**: returns the buttons to show, each one the conjunction of `canActOnVisual` and, for status changes, `canTransition`:

| Button | Shown when |
|---|---|
| Assign / Reassign | `assign` allowed and status REQUESTED or ASSIGNED |
| Start | `advance` allowed and ASSIGNED → IN_PROGRESS legal |
| Mark delivered | `advance` allowed and IN_PROGRESS → DELIVERED legal |
| Decline | `decline` allowed and → DECLINED legal |
| Cancel request | `cancel` allowed and → CANCELED legal |
| Edit details | `update` allowed and status not terminal |
| Attach / Move to story | `attach` allowed (rules above) |
| Delete | `delete` allowed (admin, terminal only) |

The UI shows exactly what the server would allow, the same way the slice 1 remove button already does. The server still checks every action itself.

Visibility follows issue §7: any signed-in user can read any request, including standalone ones.

## 2. API

### `GET /api/visuals` (new): the dashboard list

Any signed-in user (401 otherwise). Never returns PLANNED rows: the dashboard is requests, not credits.

Query parameters, all optional, parsed by a pure `parseRequestListQuery(searchParams)` that returns a Prisma `where` (tested):

| Param | Values | Default |
|---|---|---|
| `status` | comma list of REQUESTED…CANCELED, or `open` / `closed` | `open` = REQUESTED, ASSIGNED, IN_PROGRESS |
| `type` | comma list of PHOTO, GRAPHIC, MAP, VIDEO | all |
| `assignee` | a person id, `me`, or `none` | any |
| `requester` | a person id or `me` | any |
| `placement` | `placed`, `unplaced` | any |

`me` resolves to `session.user.personId`; an unlinked account asking for `me` gets an empty list, not an error. Unknown values are a 400.

Closed statuses (DELIVERED, DECLINED, CANCELED) are limited to rows updated in the last 90 days, so the list doesn't grow forever while archiving is unbuilt. The response is capped at 500 rows (same idea as `TBD_CAP`) and says so with a `truncated: true` flag.

Explicit `select`, like the Pitches pool: `id, type, status, priority, description, eventDateTime, location, deadline, declineReason, createdAt, updatedAt`, `person {id, name}`, `requestedBy {id, name}`, `story {id, slug, budgetLine}`. **Not** `notes` or `dataUrl`: notes may carry a source's contact details, so they load on the detail page only.

Sort is a pure, tested `compareRequests()` applied after the query: URGENT first, then deadline ascending with no deadline last, then oldest filed first. Doing it in code avoids relying on "URGENT" sorting after "NORMAL" alphabetically.

This one route replaces the issue's separate `GET /api/visuals/unplaced` (`placement=unplaced` covers it).

### `POST /api/visuals` (new): file a standalone request

Same gate as the story route: `canCreateContent`, `checkWriteLimit`, `requireJSON`, and the unlinked-account 400 with the slice 1 message. Body is `requestVisualSchema` unchanged (`status: "REQUESTED"` required, description required). Creates the row with `storyId: null` and `requestedById` from the session, then fires the desk email (section 5). Returns 201 with the row.

PLANNED rows can't be created here: a credit with no story means nothing.

The create data mapping is shared with the story route through a pure `visualRequestCreateData(input, requesterId, storyId)` (tested), so the two can't drift.

### `GET /api/visuals/[id]` (new handler on the existing route file)

Any signed-in user. The full row: everything above plus `notes`, `dataUrl`, the assignee's `isActive`, and the story's `onlinePubDate`. 404 if missing.

### `PATCH /api/visuals/[id]`: gains `storyId`

`updateVisualSchema` gains `storyId: z.string().cuid().optional()`. Rules, applied before the existing ones:

- On PLANNED: 400, like the other request-only fields.
- On DECLINED / CANCELED: 409 "A declined or canceled request can't be attached to a story".
- Actor must pass `canActOnVisual(..., "attach")`, else 403.
- Target story must exist (404 "Story not found") and not be SHELVED (400). Drafts and pitches are allowed: anyone who can write content can already see them.
- Moving from one story to another is allowed. **Detaching back to no story (`storyId: null`) is not** in this slice (see decision 4).
- The existing `updateMany` race guard adds `storyId: existing.storyId` to its `where`, so two people attaching at once can't both win.

Attaching sends no email.

### Unchanged

`POST /api/stories/[id]/visuals` (only its desk-email call changes, section 5) and `DELETE /api/visuals/[id]`.

## 3. The `/requests` dashboard

**Route:** `src/app/requests/` with `layout.tsx` exporting `sectionMetadata("requests")`, `page.tsx`, and a client `RequestsView.tsx`. Data via a new `useVisualRequests(filters)` SWR hook in `src/lib/hooks/`, polled every 30 seconds like `usePitches()` (it's a shared queue).

**Filters**, kept in the URL query string so a filtered view survives reload and can be shared (pure `parseRequestFilters` / `requestFiltersToQuery`, tested):

- Status: Open (default), then each status as a chip, plus "All closed".
- Type: Photo, Graphic, Map, Video chips.
- "Assigned to me", "Filed by me", "Unassigned".
- "Unplaced only": requests with no story, the home for standalone requests and for visuals left behind by a story delete.

**Rows**, densest first, one line each on desktop and stacked on mobile: type badge, status badge, Urgent badge, description, story chip (slug, links to the story) or a muted "No story" chip, requester, assignee or "Unassigned", and "Needed by" or event time (`formatPubDate`, newsroom time encoded as UTC). The whole row links to `/requests/[id]`. Status badge variants are lifted out of `VisualSection` into a shared component so both places match.

**Actions are not on the rows.** Every action lives on the detail page. That keeps one place where the decline dialog, the person picker and attach live, and keeps rows scannable. If the desk later wants one-click Assign from the list, it's an addition, not a redesign.

**Header:** "New request" button (to `/requests/new`), gated by `canCreateContent`.

Empty states: "No open requests." / "No requests match these filters."

## 4. Request detail page, attach, and standalone filing

### `/requests/[id]`

`page.tsx` → `RequestDetailWrapper` (loading and not-found) → `RequestDetail`. Shows:

- Title line: type, status badge, Urgent badge.
- Description, then the details as label/value rows: requested by, filed (date), assignee, event, location, needed by, data link (rendered only after `parseDataUrl` passes again), notes, decline reason.
- Story: the story chip with its budget line, or "Not attached to a story".
- Actions bar from `availableVisualActions`: Assign uses `PersonSelect` (active people only, as today); Decline opens a dialog requiring a reason; Cancel and Delete confirm first; Edit details reuses `VisualRequestForm` in an edit mode (initial values, PATCH).

### Attach to story

A "Attach to story" (or "Move to another story") button opens a story picker: a search box over `GET /api/search`, stories only. That endpoint already excludes shelved stories and includes pitches, and returns `id, slug, budgetLine, status`. Choosing one PATCHes `storyId`. After that, the visual shows in the story's Visuals section and its card indicators like any other, and a DELIVERED one becomes a credit through the existing CREDITED rules. No reader changes are needed.

### Story page link

In `VisualSection`, each request row (status other than PLANNED) gets an "Open" link to `/requests/[id]`. The story page still has no lifecycle buttons of its own.

### `/requests/new`

The standalone form: `VisualRequestForm` with `storyId` made optional. With no `storyId` it posts to `POST /api/visuals`, has no deadline prefill, and on success navigates to the new request's page. The description hint changes to suit a request with no story: "Say what the visuals desk should produce, and what it's for."

## 5. Email changes

All in `src/lib/visual-notifications.ts`, pure builders updated with tests.

**Desk email** (`visualRequestEmail`): `story` becomes nullable.

| | With a story (unchanged except the link) | Standalone |
|---|---|---|
| Subject | `News Budget visual request (Photo): SLUG` | `News Budget visual request (Photo): <description, cut to 55 chars at a word>` |
| Urgent subject | `URGENT visual request (Photo): SLUG` | `URGENT visual request (Photo): <description…>` |
| Lead | `Ann Smith requested a photo for a story in the News Budget.` | `Ann Smith requested a photo in the News Budget. It isn't attached to a story yet.` |
| Story line | `SLUG: budget line` | omitted |
| Link | **Request page**, plus "Story: <story link>" | Request page |

The description cut reuses `truncateAtWord()` from `notifications.ts`, the same helper pitch subjects use. Linking every desk email to the request page is a proposed change for story requests too (decision 5): the request page is where the desk acts.

The story route's call drops its `if (visual.story)` guard; both POST routes call `notifyVisualDesk` the same way.

**IN_PROGRESS story-delete notice**: the line becomes "Graphic (in progress): your visual was kept and is now unplaced. Attach it to another story from its request page: <APP_URL>/requests/<id>". `DeletedStoryNotice` gains the visual `id`; notice lines become `{ text, href? }` so the HTML can render a real link. The ASSIGNED line is unchanged.

**Requester emails**: see decision 2.

## 6. New Story form hint

Under the `VisualAddRow` in `StoryForm`'s create view, a muted line: "Need the desk to produce a visual? Save the story, then use Request a visual." Shown only when `VISUAL_REQUESTS_ENABLED`, since otherwise it names a button that doesn't exist. Add Visual and Request a visual on the story page stay exactly as they are, with no renaming.

## 7. Navigation

A new section in `src/lib/nav.ts`:

```ts
{ id: "requests", label: "Requests", href: "/requests", match: ["/requests"],
  enabled: (ctx) => VISUAL_REQUESTS_ENABLED && canCreateContent(ctx.appRole),
  inTopBar: true, tabs: () => [] }
```

- Top bar, after Pitches. Mobile menu picks it up automatically.
- Shown to content creators: the desk, and the editors and reporters who file requests and want to check on them. VIEWERs can still open the URL (read access is universal) but get no nav item, the same soft model as Teams.
- No tabs: the filters do that job. `nav.test.ts`'s layout check covers the new prefix once `src/app/requests/layout.tsx` exists; add tests for the flag and role gating.

## 8. Tests (pure only)

- `visual-requests.test.ts`: `attach` across every status and role (requester, assignee, elevated, other producer, unlinked); `availableVisualActions` for each status from the desk's, the assignee's, the requester's and an outsider's view.
- New `visual-request-list.test.ts` (for the new `src/lib/visual-request-list.ts`): `parseRequestListQuery` defaults, `open`/`closed`, comma lists, `me` with and without a personId, `none`, `placement`, unknown values rejected, the 90-day window applied to closed statuses only; `compareRequests` ordering; `parseRequestFilters` / `requestFiltersToQuery` round-trip.
- `visualRequestCreateData` lives in `visual-requests.ts` beside the other request helpers and is tested in `visual-requests.test.ts`, with and without a story.
- `validations.test.ts`: `storyId` on `updateVisualSchema` (cuid, absent stays undefined, null rejected).
- `visual-notifications.test.ts`: standalone subject, lead, no story line, request-page link; story requests link to both; IN_PROGRESS line carries the request link in text and HTML.
- `nav.test.ts`: Requests hidden when the flag is off and for VIEWER, shown for PRODUCER and up.

## 9. Documentation

- `CLAUDE.md`: the Feature Flags entry loses "leave it off until the dashboard exists" and gains the go-live checklist pointer; Navigation mentions the Requests section; the Visual data-model bullet mentions standalone requests, `POST /api/visuals`, and attach.
- `docs/email-notifications-setup.md`: standalone desk email and the new IN_PROGRESS line.
- Decision log: section 10's answers.
- The go-live checklist in section 13, completed during the last stage.

## 10. Decisions (all defaults approved Nov 17)

1. **Self-claim** (question for Ryan, photo desk). Proposed default: **not in this slice**; assign stays elevated-only. Design if wanted: a new `claim` action letting any content creator with a linked Person assign an *unassigned* REQUESTED visual to *themselves* only (PATCH `personId` equal to their own, existing `personId` null). Pair it with a "Release" back to REQUESTED by the assignee, which needs a new ASSIGNED → REQUESTED transition, or a mistaken claim is stuck until an editor reassigns. Roughly one stage of work: permissions and tests, the PATCH rule, a "Claim" button on the detail page and an "Unassigned" filter that's already planned. Can follow go-live as its own small PR.
2. **Requester emails.** Issue #23 r2 resolved that the requester is emailed on **decline** (with the reason) and on **delivery**; the Nov 16 decision moved "requester confirmations" to slice 4. Proposed default: **pull decline and delivered into this slice**, keep the on-filing confirmation in slice 4. A standalone request has no story page for the requester to watch, and a silent decline leaves them thinking coverage is arranged. Rules: fire-and-forget from the PATCH route after the transition commits; requester only, through `notifiableEmail()`; skipped when the requester made the change themselves; links to the request page. Adds one stage.
3. **Who sees the nav item.** Proposed default: content creators when the flag is on, as in section 7. Alternative: elevated roles only, with requesters using the story page.
4. **Detach.** Proposed default: attach and move only, no detach to "no story". Detach adds a state change nobody has asked for; a request filed on the wrong story can be moved. Story delete already unplaces work that needs it.
5. **Desk email link.** Proposed default: every desk email links to the request page, and story requests also link to the story. Alternative: keep story requests linking to the story only.
6. **Story-side "Attach existing"** (issue §4: a picker in `VisualSection` over unplaced DELIVERED visuals). Proposed default: **defer**. Attaching from the request page plus the dashboard's Unplaced filter covers the need, and the issue's version only allowed DELIVERED, while standalone requests need attaching at any live status.
7. **`/me`.** Issue §8 folds "my requests" into `/me`. Proposed default: **defer**; the dashboard's "Assigned to me" and "Filed by me" filters cover it for go-live. `/me` and person pages still list only credits (PLANNED, DELIVERED on a story), as now.
8. **Closed-request window.** Proposed default: 90 days by `updatedAt`, matching the shelved-story purge, until archiving exists.

### Where this departs from issue #23

| Issue says | This slice | Why |
|---|---|---|
| One `VISUALS_DESK_EMAIL` | Per-type `VISUAL_REQUEST_EMAILS_*` | Decided Nov 12, shipped in slice 2 |
| Requester emailed on decline and delivery | Decision 2 | Decision log moved it to slice 4; proposing to pull part back |
| "Attach existing" picker on the story page, DELIVERED only | Attach from the request page, any live status | Standalone requests need placing before delivery too; decision 6 |
| `GET /api/visuals/unplaced` | `GET /api/visuals?placement=unplaced` | One list route |
| `/requests/my` folds into `/me` | Dashboard filters | Decision 7 |
| Assign: "elevated, or the assignee themselves" | Elevated or current assignee (reassign only) | Elliot Nov 16; decision 1 |
| Archive filter and actions | Not built; 90-day window on closed rows | Out of scope; decision 8 |
| New indexes `[status, storyId]`, `[eventDateTime]` | None | Not needed at this volume |
| Desk email on transition back into REQUESTED (unarchive) | Not applicable | No unarchive yet |

## 11. Verification

- `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` green after every stage.
- Manual (Dave): with the flag on locally, file a story request and a standalone one; work each through assign, start, deliver; decline one with a reason; cancel one as the requester; attach a standalone request to a story and confirm it shows in the story's Visuals section and as a credit once delivered; delete a story with an IN_PROGRESS visual and find it under Unplaced; check every action is hidden for a PRODUCER who isn't involved. Mailpit for the standalone desk email, the new IN_PROGRESS notice, and requester emails if decision 2 is yes. Remember seeded people need `isStaff = true` to receive mail.

## 12. Proposed stages

Each stage ends with the four checks green and a stop for review. Nothing is committed without a go-ahead.

**Stage 1 — pure core and tests.** `attach` action, `availableVisualActions`, `parseRequestListQuery`, `compareRequests`, filter URL helpers, `visualRequestCreateData`, `updateVisualSchema.storyId`. No routes. Review point: the permission matrix and the list query rules.

**Stage 2 — API and the standalone desk email.** `GET`/`POST /api/visuals`, `GET /api/visuals/[id]`, attach in PATCH, story route using the shared create mapping. `visualRequestEmail` for a nullable story and the request-page link, with tests. Review point: route diffs. Manual: curl the list filters, file a standalone request, check Mailpit.

**Stage 3 — request detail page.** `/requests/[id]` with the actions bar, decline dialog, edit mode, attach picker; the "Open" link from `VisualSection`; shared status badge. Review point: the page in a browser, and that hidden buttons match the server.

**Stage 4 — dashboard and nav.** `/requests` page, `useVisualRequests`, URL filters, the Requests nav section and its tests. Review point: the dashboard with real data.

**Stage 5 — standalone filing and story-side polish.** `/requests/new`, `VisualRequestForm` without a story, the New Story hint, the IN_PROGRESS notice link. Review point: the full standalone flow end to end.

**Stage 6 — desk routing admin page** (section 14). The `VisualDeskRouting` table and a local `db push`; `deskRecipients()` taking the rows; `validateEmailList()`; `notifyVisualDesk` reading the table; `GET`/`PUT /api/admin/visual-desk-routing`; `/admin/visual-requests` and its Admin tab. Review point: the fallback order, the per-address errors, and the page. Manual: change a list in the page and file a request against Mailpit.

**Stage 7 — requester emails and wrap-up** (requester emails approved as decision 2). Builders, tests, PATCH wiring, docs, go-live checklist, decision log, PR description draft.

**This runs to seven stages, split into two PRs:**

- **PR 3a, stages 1–3: standalone requests and the request page.** Everything works by URL with the flag off: the API, filing by API, the detail page, attach. It changes nothing a production user can reach except the "Open" link on story-page request rows, which only appear on requests that exist. No schema change.
- **PR 3b, stages 4–7: dashboard, filing UI, desk routing, emails, go-live.** Has the one schema change (section 14). Ends with the checklist; the flag is turned on after it deploys.

If decision 1 comes back "yes, before go-live", self-claim becomes a stage in PR 3b.

## 13. Go-live checklist

Work through this after PR 3b deploys, before turning the flag on in production.

- [ ] **Ryan's answer on self-claim**, recorded in the decision log **before PR 3b merges**. If the answer is "yes, before go-live", self-claim becomes a stage in PR 3b (decision 1).
- [ ] **Schema pushed** with PR 3b's deploy: `pg_dump` backup, then `npx prisma db push` (adds the `VisualDeskRouting` table; additive, no backfill). See section 15.
- [ ] **Desk addresses set on the server:** `VISUAL_REQUEST_EMAILS_PHOTO`, `VISUAL_REQUEST_EMAILS_GRAPHIC`, and **confirm `VISUAL_REQUEST_EMAILS_VIDEO` is set** (`visualrequests@oregonian.com`). These stay the fallback when a type has no address list in the admin page. An empty list with no table row silently skips the desk email for that type.
- [ ] **Desk routing page checked** at `/admin/visual-requests`: each type shows the addresses it will actually use, and Map shows that it follows Graphic unless given its own list.
- [ ] `NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED=true` in the server `.env`, then a **full rebuild**: the flag is baked into the client bundle, so a restart alone isn't enough.
- [ ] Smoke test in production: file a story request and a standalone one, check both desk emails arrive, work one through to delivered, and confirm the Requests nav item shows for a producer and not for a viewer.
- [ ] **Heads-up note to the newsroom before the flag flips:** a few lines saying what's new (Request a visual on the story page, standalone requests from Requests, the dashboard), that Add Visual still just records a visual already arranged, and who to ask on the visuals desk.

## 14. Desk routing in the app (PR 3b, added Nov 17)

Elliot asked for an admin page to change where request emails go without editing the server `.env`. The env vars from slice 2 stay as the fallback, so nothing changes until an admin saves a list.

### Table

```prisma
// One row per visual type: where its desk email goes. A missing or empty row
// falls back to the VISUAL_REQUEST_EMAILS_* env var (deskRecipients()).
model VisualDeskRouting {
  type        String   @id   // PHOTO | GRAPHIC | MAP | VIDEO
  emails      String          // comma-separated, stored as normalized by parseEmailList
  updatedAt   DateTime @updatedAt
  updatedBy   User?    @relation("visualDeskRoutingUpdated", fields: [updatedById], references: [id], onDelete: SetNull)
  updatedById String?
}
// User: visualDeskRoutingUpdated VisualDeskRouting[] @relation("visualDeskRoutingUpdated")
```

- `type` is the primary key, so there is at most one row per type and no seed is needed: a type with no row simply uses its fallback.
- `updatedById` points at the `User` who saved it, with `SetNull`, like `updatedByUserId` on availability rows. The page shows that user's name, or "a deleted user".
- Additive table, no backfill. Applied with `npx prisma db push` (section 15).

### Resolution order (`deskRecipients`)

`deskRecipients(type, env, rows)` stays pure: the caller passes the table rows in alongside `env`; nothing is queried inside it. A row counts only if `parseEmailList(row.emails)` is non-empty.

| Type | 1st | 2nd | 3rd |
|---|---|---|---|
| PHOTO | PHOTO row | `VISUAL_REQUEST_EMAILS_PHOTO` | — |
| GRAPHIC | GRAPHIC row | `VISUAL_REQUEST_EMAILS_GRAPHIC` | — |
| MAP | MAP row | GRAPHIC row | `VISUAL_REQUEST_EMAILS_GRAPHIC` |
| VIDEO | VIDEO row | `VISUAL_REQUEST_EMAILS_VIDEO` | — |

Map gets its own row but, with none, behaves exactly as Graphic does today, whichever source Graphic is using. No `VISUAL_REQUEST_EMAILS_MAP` variable is added.

A companion pure `deskRecipientSource(type, env, rows)` returns which step answered (`"table"`, `"graphic table"`, `"env"`, `"none"`) so the admin page can say "Using the server default" or "Following Graphic".

**Consequence to know:** clearing a field means "use the fallback", not "send nothing". To stop a type's desk email entirely, its env var must also be empty. That keeps the page from silently switching off intake; it's stated on the page.

`notifyVisualDesk()` reads the rows (`prisma.visualDeskRouting.findMany()`, four rows at most) before resolving. If that read fails, it logs and resolves from `env` alone, so a database hiccup can't stop the desk email.

### Validation

New pure `validateEmailList(raw)`: runs `parseEmailList` (trim, drop blanks, dedupe case-insensitively), then checks each address with Zod's email check. Result: `{ ok: true, emails }` or `{ ok: false, errors: [{ address, message }] }`, one error per bad address, so the page can say "`dave@oregonian` isn't a valid email address" rather than failing the whole field. At most 20 addresses and 2,000 characters per list. Saved in normalized form (`a@x.com, b@x.com`).

### API: `/api/admin/visual-desk-routing`

Admin-only (`hasAdminAccess`), like the rest of `/api/admin/**`. Every handler exports `dynamic = 'force-dynamic'`.

- `GET`: for each of the four types, the saved list (or none), who saved it and when, the env fallback value, the effective recipients, and the source. Reading the env vars here is fine: the route is server-side and admin-only, and the addresses aren't secret.
- `PUT`: body `{ type, emails }`, one type per save, `checkWriteLimit` and `requireJSON`. Invalid addresses are a 400 with the per-address errors. An empty `emails` deletes the row (back to the fallback). Otherwise an upsert setting `updatedById` from the session.

### Page: `/admin/visual-requests`

Under the existing admin layout (server-side `hasAdminAccess` redirect), with a "Visual requests" tab added to the Admin section in `src/lib/nav.ts`. The tab shows for every admin whether or not `VISUAL_REQUESTS_ENABLED` is on, so routing can be set up before go-live. Follows the `/admin/tags` pattern: `page.tsx` plus a client view with SWR.

One card per type (Photo, Graphic, Map, Video), each with:

- A text field for the comma-separated list and its own Save button.
- Inline errors per bad address from the 400 response; client-side `validateEmailList` runs first for instant feedback.
- "Last changed by <name>, <date>" (a genuine instant, so `formatTimestampPacific`), or "Not set here".
- What it will actually use: "Sending to: …", with "(server default)" or, for Map, "(following Graphic)".
- A one-line note on the page: "Clearing a list returns that type to the server default. It doesn't turn the email off."

### Tests (pure)

- `deskRecipients`: each type from its row; an empty or whitespace row falls back to env; no row falls back to env; MAP from its own row, then the GRAPHIC row, then the GRAPHIC env var; MAP's own empty row still follows Graphic; unknown type is empty; nothing configured is empty. The existing slice 2 tests keep passing with `rows` defaulting to `[]`.
- `deskRecipientSource`: each step named correctly.
- `validateEmailList`: good list normalized; one bad address among good ones gives exactly that error; duplicates and blanks dropped; empty input is ok and empty; over the limits rejected.
- `nav.test.ts`: the new Admin tab shows for admins only, and its prefix sits under the admin layout.

### Documentation

`CLAUDE.md` Environment Variables: the env vars are now the fallback behind the admin page. `docs/email-notifications-setup.md`: the resolution order and the page. `.env.example`: comment updated to match.

## 15. Deploy

- **PR 3a:** no schema change. `git pull`, build, `chown`, restart, as usual.
- **PR 3b:** one additive table. On the server: `pg_dump` backup, `git pull`, **`npx prisma db push`** (creates `VisualDeskRouting`; no existing data touched), build, `chown` to apache, restart. Vercel preview deploys apply it automatically through `vercel-build`; production does not.
- The flag is turned on only after PR 3b is deployed and the checklist in section 13 is done.
