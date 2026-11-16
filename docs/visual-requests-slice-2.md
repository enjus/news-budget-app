# Visual requests — Slice 2 (desk and assignee emails)

Source: issue #23; builds on [`visual-requests-slice-1.md`](visual-requests-slice-1.md). Routing decided Nov 12, assignee notice confirmed by Elliot Nov 16 (decision log). Status: approved Nov 16, in progress (stage 1).

## Goal

Two emails, both best-effort:

1. **Desk email.** Filing a request (a `Visual` created with `status: "REQUESTED"`) emails the desk that handles that type, so the visuals desk learns about work without watching the app.
2. **Assignee notice on story delete.** When a story is deleted (by hand or by the purge cron), everyone assigned to an ASSIGNED or IN_PROGRESS visual on it is told the story is gone, and IN_PROGRESS assignees are told their visual now lives on as unplaced.

Sending never blocks or fails the operation that triggered it.

## Out of scope

The `/requests` dashboard (slice 3), calendar invites and `METHOD:CANCEL` (slice 4), emails on assign / advance / decline / cancel, requester confirmations, archive and purge of visuals, a settings UI for desk addresses.

## 1. Recipients: runtime env vars

Addresses live in server-side env vars read at send time, never `NEXT_PUBLIC_`, so a routing change is a `.env` edit and a restart, not a build.

| Variable | Used for | Decided value (Nov 12) |
|---|---|---|
| `VISUAL_REQUEST_EMAILS_PHOTO` | `PHOTO` | `visualrequests@oregonian.com` |
| `VISUAL_REQUEST_EMAILS_GRAPHIC` | `GRAPHIC` **and `MAP`** | `visualrequests@oregonian.com, dcansler@oregonian.com, mfriesen@oregonian.com` |
| `VISUAL_REQUEST_EMAILS_VIDEO` | `VIDEO` | `visualrequests@oregonian.com` (same as Photo; decided Nov 16) |

Rules:

- Comma-separated. Whitespace around each address is trimmed, blanks dropped, duplicates removed case-insensitively (first spelling wins). No syntax validation beyond "non-empty after trim": the relay rejects garbage and `sendEmail()` logs it.
- Map has no list of its own; it reads the graphic list. Adding a map-specific list later is a one-line change in `deskRecipients()`.
- Video: has its own variable so it can diverge later; its decided value is the photo desk address (Nov 16).
- **Empty list for a type: log and skip.** `console.warn("Visual request desk email skipped: no recipients configured for <TYPE>")` and the request is still created and returned `201`. Nothing is retried.
- Unknown type (can't happen through the Zod enum, but the helper takes a string): treated as empty.

Documented in `.env.example` (all three, empty strings, with a comment that Map uses the graphic list) and in the CLAUDE.md Environment Variables paragraph, plus a short section in `docs/email-notifications-setup.md`.

No additional gate behind `VISUAL_REQUESTS_ENABLED`: that flag only hides the form, and the API already accepts requests regardless. Leaving the lists empty is the off switch for the email itself.

## 2. Desk email

**Trigger:** the REQUESTED branch of `POST /api/stories/[id]/visuals`, after `prisma.visual.create` succeeds. The `create` gains `include: { requestedBy: { select: { name: true } }, story: { select: { id, slug, budgetLine } } }` (one query; the route already includes `person`). The 201 response is unchanged.

**Pattern:** same as `notifyStoryTeam` in `stories/[id]/route.ts`:

```ts
notifyVisualDesk(visual).catch((error) => console.error("Visual request desk email failed:", error));
```

`sendEmail()` already never throws; the `.catch` covers anything upstream of it (a bug in the body builder) so the handler can never 500 because of email.

**Subject**

- Normal: `News Budget visual request (Photo): <slug>`
- Urgent: `URGENT visual request (Photo): <slug>`

Type label from `VISUAL_TYPE_LABELS` (`src/lib/visual-types.ts`). Slug is the story slug, matching `News Budget story updated: <slug>`.

**Body** (text and HTML, same content; HTML is `<p>` blocks with `<strong>` labels and `escapeHtml`, like the story-update email). Lines whose value is null are omitted entirely rather than shown as "—".

```
<Requester name> requested a <type> for a story in the News Budget.

<slug>: <budget line>

Type: Photo
Priority: Urgent              (only when URGENT)
What's needed: <description>
Event: Tue, Nov 18, 2:30 PM   (eventDateTime, formatPubDate: newsroom time encoded as UTC)
Location: <location>
Needed by: Sun, Nov 23, 6:00 AM   (deadline, same formatter)
Data: https://...             (dataUrl, plain in text; <a href> in HTML only after parseDataUrl passes again)
Notes: <notes>                (newlines → <br> in HTML)

View the story: <APP_URL>/stories/<id>
```

Notes on fields:

- `description` is required as of stage 5, so "What's needed" always appears.
- `eventDateTime` and `deadline` follow the pub-date convention (newsroom time encoded as UTC), so they are formatted with `formatPubDate()` from `src/lib/utils.ts`, **not** `formatTimestampPacific()`. Verify `formatPubDate`'s exact output shape when implementing; the spec's examples are illustrative.
- `dataUrl` was validated on write, but the HTML builder re-runs `parseDataUrl()` before emitting an `href` (same defense-in-depth rule as the UI in slice 1). If it somehow fails, the link is shown as plain text.
- The requester's name comes from `visual.requestedBy.name`. If the relation is null (person deleted between create and send, which is practically impossible but the type allows it), the lead reads "A visual request was filed for a story…".
- The link goes to the story page, where the Visuals section shows the request. There is no request page yet.

**Recipients** are the desk list only. The requester is not copied; requester confirmations are slice 4 (decided Nov 16).

## 3. Assignee notice on story delete

**Who:** for each visual on the story with status ASSIGNED or IN_PROGRESS, the assignee (`visual.person`), filtered through `notifiableEmail()` (active staff with an email, same rule as every other notification). REQUESTED has no assignee; PLANNED/DELIVERED/DECLINED/CANCELED get no notice (a PLANNED credit is not a work assignment, and the other three are over). One email per person, even if they hold several visuals on the story.

**Where the data comes from.** Both delete paths go through `settleVisualsForStoryDelete(tx, storyIds)` in `src/lib/story-delete.ts`. It already reads every visual's `id` and `status` inside the transaction, before anything is deleted; the read grows to `{ id, type, status, storyId, person: { name, email, isActive, isStaff } }` plus a lookup of `{ id, slug, budgetLine }` for the stories. The helper returns the ASSIGNED/IN_PROGRESS rows (with their story) as `DeletedStoryNotice[]` instead of `void`. `deleteStoriesWithVisuals()` concatenates the notices from every batch and returns `{ deleted, notices }` instead of a number.

Reading inside the transaction and sending **after commit** matters: if the transaction rolls back, nothing is sent, and the email never says "deleted" about a story that still exists.

**Email** (one per assignee; subject `News Budget story deleted: <slug>`):

```
A story you have a visual assignment on was deleted from the News Budget.

<slug>: <budget line>

Your visuals on it:
- Photo (assigned): this assignment was removed with the story.
- Graphic (in progress): your visual was kept but is no longer attached to a
  story. Contact the visuals desk if it needs a new home.

Deleted by: <name>           (DELETE route: session user name; cron: "the nightly purge of stories shelved more than 90 days")
```

No "view it" link: the story is gone. The IN_PROGRESS line deliberately doesn't mention a dashboard that doesn't exist; update it to link to `/requests` when slice 3 ships.

**Two call sites:**

| Path | After the transaction | Blocking? |
|---|---|---|
| `DELETE /api/stories/[id]` | `notifyVisualAssigneesOfStoryDelete(notices, deletedBy).catch(log)` | Fire-and-forget, like `notifyStoryTeam`. The 200 is returned immediately. |
| `GET /api/cron/purge-shelved` | `await notifyVisualAssigneesOfStoryDelete(notices, PURGE_ACTOR)` | **Awaited** (decided Nov 16). There is no user waiting, and on a serverless host a fire-and-forget promise can be frozen with the function after the response. `sendEmail` never throws, and the helper wraps everything else in try/catch, so awaiting it cannot fail the cron either. The response gains `notified: <count>`. |

The purge cron already purges in batches of 25 stories, each its own transaction. Notices are collected per batch and sent once at the end; if a later batch throws, notices from committed batches are still sent before the 500 is returned (wrap the send in the same `try`, after the loop). Decided Nov 16.

## 4. Module layout

New `src/lib/visual-notifications.ts`, split pure / impure like `notifications.ts`:

Pure (exported, tested):

- `parseEmailList(raw: string | undefined): string[]`
- `deskRecipients(type: string, env: Record<string, string | undefined>): string[]` — env passed in, never read from `process.env` inside, so tests don't touch the environment.
- `visualRequestEmail(input: VisualRequestEmailInput): { subject, text, html }`
- `storyDeletedNotices(notices: DeletedStoryNotice[]): Map<email, { person, story, lines }>` — groups rows per recipient, applies `notifiableEmail()`, builds the per-visual lines.
- `storyDeletedEmail(group, deletedBy): { subject, text, html }`

Impure (thin, untested, mirrors `notifyStoryTeam`):

- `notifyVisualDesk(visual)` — `deskRecipients(visual.type, process.env)`, warn-and-return if empty, `sendEmail`.
- `notifyVisualAssigneesOfStoryDelete(notices, deletedBy)` — group, `sendEmail` per recipient, `Promise.allSettled`.

`escapeHtml` and `APP_URL` in `notifications.ts` are module-private today; export them (or move `escapeHtml` to `src/lib/html.ts`) rather than duplicating.

`src/lib/story-delete.ts`: `settleVisualsForStoryDelete` returns `DeletedStoryNotice[]`; `deleteStoriesWithVisuals` returns `{ deleted: number; notices: DeletedStoryNotice[] }`. The two existing callers adapt.

## 5. Tests (`src/lib/visual-notifications.test.ts`, pure only)

- `parseEmailList`: undefined / empty / whitespace → `[]`; trims; drops blank entries from `a,,b`; dedupes case-insensitively keeping the first spelling.
- `deskRecipients`: PHOTO reads the photo var; GRAPHIC and MAP both read the graphic var; VIDEO reads the video var; unknown type → `[]`; missing var → `[]`.
- `visualRequestEmail`: subject normal vs URGENT; type label in subject; every optional field appears when set and is absent when null (event, location, deadline, data, notes); `Priority:` line only for URGENT; HTML escapes `<` in the description; data link rendered as `<a href>` only when `parseDataUrl` passes, plain text otherwise; story link ends in `/stories/<id>`; requester-null lead.
- `storyDeletedNotices`: two visuals for one person → one group with two lines; ASSIGNED and IN_PROGRESS wording differ; a contributor or inactive assignee is dropped; a visual with no person is dropped; two people on one story → two groups.
- `storyDeletedEmail`: subject; both wording variants present in text and HTML; `Deleted by` line for a named user and for the purge actor.

Nothing for the route wiring or the cron: those are checked by `tsc`, `build`, and a manual smoke test.

## 6. Documentation

- `.env.example`: the three variables with a comment block.
- `CLAUDE.md`: a sentence in Environment Variables (runtime, comma-separated, Map uses graphic, empty skips) and a line in the `Visual` data-model bullet that story delete now returns notices and both delete paths send them.
- `docs/email-notifications-setup.md`: a "Visual request emails" section with the variables and the two triggers.
- Decision log (`~/.claude/plans/visual-requests-pr-decisions.md`): the section 8 answers are recorded there.

## 7. Verification

- `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` after every stage.
- Manual, with Mailpit (`brew install mailpit`) as the local sink: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, inbox at http://localhost:8025. Then: file a Photo request (normal and urgent) with and without the optional fields; file one with the photo list empty and confirm a warning plus a 201; delete a story holding ASSIGNED, IN_PROGRESS, and PLANNED visuals and check one email per assignee with the right lines; run the purge cron against a shelved story with an IN_PROGRESS visual.

## 8. Decisions (confirmed Nov 16)

1. Video requests: own variable, set to `visualrequests@oregonian.com` (same as Photo).
2. The requester is not copied on the desk email; requester confirmations are slice 4.
3. The cron awaits the assignee sends; the API route fires and forgets.
4. Cron sends notices from committed batches even if a later batch fails.
5. IN_PROGRESS wording: "your visual was kept but is no longer attached to a story. Contact the visuals desk if it needs a new home." No mention of a dashboard until slice 3 ships.
6. Manual checks use Mailpit (SMTP localhost:1025, inbox http://localhost:8025).

## 9. Proposed stages

Each stage ends with the four checks green and a stop for review. Nothing is committed without a go-ahead.

**Stage 1 — pure module and tests.** `src/lib/visual-notifications.ts` (pure part only, impure functions stubbed or omitted) and `visual-notifications.test.ts`; export `escapeHtml`/`APP_URL` from `notifications.ts`. No route changes. Review point: email wording, recipient rules, test coverage.

**Stage 2 — desk email wired.** `notifyVisualDesk()`, the `include` and fire-and-forget call in the visuals POST route, `.env.example`, CLAUDE.md, `email-notifications-setup.md`. Review point: route diff and env docs. Manual check: file requests against a local sink.

**Stage 3 — story-delete notices.** `story-delete.ts` return types, `notifyVisualAssigneesOfStoryDelete()`, the DELETE route (fire-and-forget) and the cron (awaited, `notified` in the response). Review point: the transaction-then-send ordering and the cron's failure path. Manual check: delete by hand and via cron.

**Stage 4 — wrap-up.** Decision log entries, final full check run, PR description draft. Review point: the whole diff.
