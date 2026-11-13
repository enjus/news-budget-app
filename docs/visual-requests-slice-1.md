# Visual requests — Slice 1 (core)

Source: issue #23, "Visual requests built on Visual" (enjus/news-budget-app).
Owner: Dave (Elliot asked him to take it). Status: spec. Defaults marked **[confirm]** are my proposals and need Elliot's OK.

## Goal

Make `Visual` a lifecycle row so a story can *request* a photo, graphic, map, or video, assign it, and track it to delivery. The delivered visual's assignee is the credit — no second table.

Slice 1 only: schema, status rules, API, story-delete handling, status filtering in existing readers, and the "Request" form behind a feature flag.

## Out of scope (later slices)

**File uploads — decided against.** Requesters attach data by *linking* to it (SharePoint, OneDrive, Google Sheets) via `dataUrl`. No file storage is built. Revisit only if people outside the org need to supply data.

Visuals-desk email, the `/requests` dashboard, "Attach existing" / Unplaced filter, archive + purge, requester emails, calendar invites.

## Repo conventions to follow (from CLAUDE.md)

- Schema ships with `npx prisma db push`, not migrations (`migration_lock.toml` is stale SQLite).
- Client fetches go through `apiPath()`. Mutating routes call `checkWriteLimit()` and `requireJSON()`.
- Tests are pure-function vitest tests in the existing style. No DB, network, or component-test harness.
- New features are dark-launched behind a flag in `src/lib/features.ts`; routes still work by direct URL when the flag is off.
- Before editing shared files, run `gh pr list --state open` and check for overlap.
- Never run `npm audit fix --force`.

## 1. Findings that change the issue's plan

1. **`status` changes what a visual means to existing code.** A declined or merely-requested visual must not count as a credit, an indicator, or a notification recipient. See section 6.
2. **Permissions.** Today any `canCreateContent` user can PATCH or DELETE any visual (that is how "Add" and its remove button work). The issue's section 7 would make delete admin-only. Gate by status instead: PLANNED rows keep today's rules; the issue's rules apply to REQUESTED and later. **[confirm]**
3. **Name both Person relations** in the schema. Run `npx prisma validate` first.

## 2. Schema (all additive)

```prisma
model Visual {
  // existing: id, type, description, personId, createdAt, updatedAt
  story         Story?   @relation(fields: [storyId], references: [id], onDelete: SetNull)
  storyId       String?
  status        String   @default("PLANNED")
  // PLANNED | REQUESTED | ASSIGNED | IN_PROGRESS | DELIVERED | DECLINED | CANCELED
  person        Person?  @relation("visualAssigned", fields: [personId], references: [id], onDelete: SetNull)
  requestedBy   Person?  @relation("visualsRequested", fields: [requestedById], references: [id], onDelete: SetNull)
  requestedById String?
  priority      String   @default("NORMAL")   // NORMAL | URGENT (cosmetic)
  eventDateTime DateTime?
  location      String?
  deadline      DateTime?
  notes         String?
  dataUrl       String?   // https link to the requester's data (SharePoint/OneDrive/Sheets); never a file upload
  declineReason String?
  archived      Boolean  @default(false)
  archivedAt    DateTime?
  icalSequence  Int      @default(0)

  @@index([status])
  @@index([storyId])
  @@index([personId])
  @@index([archived])
}
// Person: visuals Visual[] @relation("visualAssigned")
//         visualsRequested Visual[] @relation("visualsRequested")
```

The archive and `icalSequence` columns are here only so later slices don't need a second push. Every existing row becomes PLANNED and behaves as today.

## 3. `src/lib/visual-requests.ts` (pure, tested)

- Status sets: **ACTIVE** (all except DECLINED, CANCELED), **CREDITED** (PLANNED, DELIVERED), **NOTIFIABLE** (ACTIVE minus REQUESTED). **[confirm]**
- `canTransition(from, to)`:
  - REQUESTED → ASSIGNED | DECLINED | CANCELED
  - ASSIGNED → IN_PROGRESS | DECLINED | CANCELED (reassign stays ASSIGNED)
  - IN_PROGRESS → DELIVERED | CANCELED
  - DELIVERED, DECLINED, CANCELED: terminal
  - PLANNED: no transitions
- `canActOnVisual(role, userPersonId, visual, action)` — the issue's section 7 table, with PLANNED keeping today's rules. "Assignee themselves" compares `visual.personId` to `session.user.personId`.
- `partitionVisualsForStoryDelete(visuals)` → `{ deleteIds, unplaceIds }`.

## 4. API

- `POST /api/stories/[id]/visuals`: accepts `status` of PLANNED or REQUESTED only. REQUESTED ignores `personId` and sets `requestedById` from the session. Validation via a new `requestVisualSchema` in `validations.ts` (type, description, eventDateTime, location, deadline, priority, notes, dataUrl).
- `dataUrl` is optional and validated by a pure `parseDataUrl(input)` in `visual-requests.ts`: trim; must parse as a URL; protocol must be exactly `https:`; reject embedded credentials (`user:pass@`); max 2048 chars; empty string becomes `null`. This is a security check, not cosmetics: a bare "is it a URL" test accepts `javascript:` links, which are unsafe to render as a clickable href.
- `dataUrl` is editable with the same permission as the other request details.
- `PATCH /api/visuals/[id]`: transitions, assignment, and decline (requires `declineReason`), all routed through the pure functions above.
- Existing PATCH/DELETE behavior for PLANNED rows is unchanged.

## 5. Story delete

`DELETE /api/stories/[id]` (`prisma.story.delete`, ~line 190) becomes a transaction applying `partitionVisualsForStoryDelete`, then deleting the story. Ships in this PR because `SetNull` removes the old cascade.

Default **[confirm]**: PLANNED, REQUESTED, ASSIGNED, DECLINED, CANCELED die with the story; IN_PROGRESS and DELIVERED get `storyId = null`.

## 6. Readers to update

| Reader | Change |
|---|---|
| `StoryCard.tsx` :158–161, plus the 6 card payloads (daily, agenda, enterprise, edition, drafts, tags/[key]/stories) | Add `status` to the `visuals` select; indicators count ACTIVE only. |
| `utils.ts` `formatBudgetLineCopy` (~:364) | "Photos by…" uses CREDITED only. |
| `notifications.ts` `collectEmails` (~:274); also used by `comments.ts` (~:105, :203) and the publish route | Only NOTIFIABLE statuses; select `status` in `comments.ts`. |
| `utils.ts` `dedupeVisualCredits` (~:457) and `/api/people/[id]/content` (~:190) | `storyId` is now nullable: exclude unplaced visuals from person lists (they would collapse into one `null:PHOTO` key) and filter to CREDITED. |
| `StoryDetail.tsx` :230 `hasAssignments` | Check what it gates; count ACTIVE visuals only. |

TypeScript will flag the remaining `storyId: string` assumptions (e.g. `VisualWithPerson`).

## 7. UI and flag

- A "Request" form beside "Add" in `VisualSection.tsx`. Prefill `deadline` from the story's `onlinePubDate` and the description placeholder from `budgetLine`.
- The form has an optional **"Link to data"** field with helper text: "SharePoint, OneDrive, or Google Sheets link. Make sure the visuals desk can open it." Where the request is displayed, render the link only if it passes `parseDataUrl` again (defense in depth), with `target="_blank"` and `rel="noopener noreferrer"`.
- Sharing permissions live in SharePoint/Google, not this app. The app only stores the link.
- Flag: `VISUAL_REQUESTS_ENABLED = process.env.NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED === "true"` in `features.ts`. Add to `.env.example` and the Feature Flags section of CLAUDE.md.

## 8. Tests (`src/lib/visual-requests.test.ts`)

Every legal and illegal transition; the permission matrix (including the PLANNED carve-out); status-set membership; `partitionVisualsForStoryDelete` for each status; `parseDataUrl` accepts normal https links (including uppercase scheme) and rejects `http:`, `javascript:`, `data:`, `file:`, `ftp:`, protocol-relative `//host`, credentials in the URL, over-length input, and non-URLs, and maps empty/whitespace to `null`.

## 9. Verification checklist

- [ ] `npx prisma validate`
- [ ] `npx prisma db push` (local)
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Manually: add a PLANNED visual (unchanged), file a REQUESTED one, walk it through transitions, decline one, delete a story that has visuals in several statuses.

## 10. Deploy

After merge, on the server: `pg_dump` backup, `git pull`, `npx prisma db push`, build, `chown` to apache, restart. Leave the flag **off** in production until slice 3 exists, since that is the only place unplaced visuals are visible.

## 11. Decisions to confirm with Elliot

1. Story delete: IN_PROGRESS and DELIVERED become unplaced; everything else dies with the story.
2. The ACTIVE / CREDITED / NOTIFIABLE status sets.
3. PLANNED rows keep today's open edit/delete rules.
4. Data is attached as a link only (no uploads). Revisit if people outside the org need to supply data. **[confirm]**

Later slices: the desk email (slice 2) and the calendar invite (slice 4) should include the data link when present.

Later (slice 4): the calendar invite's `ORGANIZER` should be the requester or the desk address, not the noreply mailbox, or Accept/Decline replies go nowhere.
