# Email Notifications

Story updates trigger email notifications when "Save & Notify Team" is clicked. The implementation uses **Nodemailer** with a **local postfix relay** (no SMTP auth required — the relay trusts the server's IP and forwards to the org mail relay).

## How It Works

```
User clicks "Save & Notify Team"
  → PUT /api/stories/[id] or PUT /api/videos/[id]
    → DB update with notifyTeam: true
    → src/lib/notifications.ts collects recipients from assignments
    → src/lib/email.ts sends via localhost:25
    → notifyTeam reset to false
```

**Recipients**: everyone assigned to the story (StoryAssignment people + Visual people). Excludes the person who clicked "Save & Notify."

**Email format**: Subject is `News Budget story updated: {slug}`. Body leads with the slug as the headline, followed by the budget line and notes.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | *(unset — disables email)* | Mail relay hostname (e.g. `localhost`) |
| `SMTP_PORT` | `25` | Mail relay port |
| `MAIL_FROM` | `News Budget <newsbudget-noreply@oregonian.com>` | Sender address |
| `APP_PUBLIC_URL` | `https://ornews-advancelocal.msappproxy.net/news-budget` | Base URL for story links in emails |

If `SMTP_HOST` is not set, `sendEmail()` silently no-ops — the app works fine without email configured.

## Visual Request Emails

Filing a visual request emails the desk for that visual type, whether it's filed on a story (`POST /api/stories/[id]/visuals` with `status: "REQUESTED"`) or standalone (`POST /api/visuals`).

**Where it goes.** An admin can set each type's list at **`/admin/visual-requests`** (Admin → Visual requests), stored in the `VisualDeskRouting` table with who changed it and when. A saved list wins. Otherwise the type falls back to a runtime env var, read at send time, so changing it is a `.env` edit and a restart, not a rebuild:

| Variable | Used for |
|----------|----------|
| `VISUAL_REQUEST_EMAILS_PHOTO` | Photo requests |
| `VISUAL_REQUEST_EMAILS_GRAPHIC` | Graphic requests, and Map requests when neither Map nor Graphic has a saved list |
| `VISUAL_REQUEST_EMAILS_VIDEO` | Video requests (decided value: the same address as `_PHOTO`, kept separate so it can diverge) |

Resolution order, per type: its saved list, if it has any addresses; for Map only, Graphic's saved list; then its env var (Map reads the graphic one). Clearing a saved list returns the type to its fallback; it doesn't turn the email off. To stop a type's email entirely, its env var must also be empty. If reading the table fails, the send logs it and uses the env vars alone.

Each list is comma-separated; whitespace is trimmed and duplicates dropped. The admin page checks each address and names any bad one. If a type resolves to no addresses, the send is logged and skipped and the request is still filed. The email is fire-and-forget: a failure never fails the API call.

**Subject**: `News Budget visual request (Photo): {slug}`, or `URGENT visual request (Photo): {slug}` for urgent requests. A standalone request has no slug, so its subject uses the start of the description, cut at a word to 55 characters. **Body**: the requester, the slug and budget line (or a line saying it isn't attached to a story yet), then type, priority (urgent only), what's needed, event time, location, needed-by, the request's links, and notes (blank fields omitted). One link reads `Link: {url}`; several read `Links:` with one per line (`<br>`-separated in HTML). Each link is an `<a href>` in HTML only if it passes `parseDataUrl()` again, plain text otherwise. Links come from `visualLinks()`, so an older request's single `dataUrl` still shows. Every desk email links to the request page (`/requests/{id}`); a story request also links to the story. Event and needed-by times follow the pub-date convention (newsroom time encoded as UTC).

Code: `src/lib/visual-desk-routing.ts` (`deskRecipients()`, `validateEmailList()`; pure and mail-free), `src/lib/visual-notifications.ts` (`visualRequestEmail()`), and `src/lib/visual-desk-routing-server.ts` (`notifyVisualDesk()`, which reads the table); specs in `docs/visual-requests-slice-2.md` and `docs/visual-requests-slice-3.md` §14.

### Requester emails: declined and delivered

When a request is **declined** or **delivered** (`PATCH /api/visuals/[id]`), its requester gets one email, fire-and-forget after the change is saved:

- Declined: `News Budget visual request declined (Photo): {slug}`, with who declined it, the reason, and "talk to the visuals desk or file a new request".
- Delivered: `News Budget visual delivered (Photo): {slug}`, with who delivered it. A standalone delivered request adds a nudge to attach it to a story.

Both list the request's links under what was asked for, in the same format and with the same href rule as the desk email. A standalone request's subject uses the start of its description, like the desk email. Both link to the request page and, for a story request, the story. The requester must pass `notifiableEmail()`, and nothing is sent when they made the change themselves. Nothing is sent on assign, claim, release, start, or cancel. Code: `requesterNoticeRecipient()` / `requesterNoticeEmail()` in `src/lib/visual-notifications.ts`, sent by `notifyRequesterOfOutcome()` in `src/lib/visual-requester-notify-server.ts`. To test locally, the requester needs `isStaff = true` (see below).

### Story-delete notices to visual assignees

When a story is deleted — by hand (`DELETE /api/stories/[id]`) or by the nightly purge (`/api/cron/purge-shelved`) — each assignee of an ASSIGNED or IN_PROGRESS visual on it gets one email, subject `News Budget story deleted: {slug}`, listing their visuals: an ASSIGNED one was removed with the story; an IN_PROGRESS one was kept as an unplaced visual, and its line links to the request page where it can be attached to another story. Recipients follow the usual rule (active staff with an email, `notifiableEmail()`). The notices are read inside the delete transaction and sent only after it commits. The API route sends fire-and-forget; the cron awaits the sends and reports `notified` in its response, and still emails the assignees of already-deleted batches if a later batch fails.

Code: `notifyVisualAssigneesOfStoryDelete()` in `src/lib/visual-notifications.ts`, fed by `settleVisualsForStoryDelete()` in `src/lib/story-delete.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/email.ts` | Nodemailer transport; `sendEmail(params)` function |
| `src/lib/notifications.ts` | `notifyStoryUpdated()` — builds and sends story update emails |
| `src/lib/visual-desk-routing.ts` | Desk recipient resolution and list validation (pure) |
| `src/lib/visual-notifications.ts` | Email builders; `notifyVisualAssigneesOfStoryDelete()` — assignee notice when a story with assigned visuals is deleted |
| `src/lib/visual-desk-routing-server.ts` | `notifyVisualDesk()` — desk email when a visual is requested, reading `/admin/visual-requests` routing first |
| `src/lib/visual-requester-notify-server.ts` | `notifyRequesterOfOutcome()` — requester email when a request is declined or delivered |

## Local Testing

Use [Mailpit](https://mailpit.axllent.org/) (`brew install mailpit`, then `mailpit`) or [MailHog](https://github.com/mailhog/MailHog) to capture emails without delivering them. Both listen for SMTP on `localhost:1025` and show the inbox at http://localhost:8025:

```bash
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

```env
SMTP_HOST=localhost
SMTP_PORT=1025
```

Open http://localhost:8025 to view captured emails.

**Seeded people aren't staff.** Every notification recipient must pass `notifiableEmail()` (active, `isStaff: true`, with an email), and `prisma/seed.ts` creates people with `isStaff` false. To test story-update, comment, or story-delete emails locally, set `isStaff = true` (and an email) on the assignee first, e.g. in Prisma Studio or with `UPDATE "Person" SET "isStaff" = true WHERE id = '...'`. The visual-request desk email is unaffected: its recipients come from `/admin/visual-requests` or the `VISUAL_REQUEST_EMAILS_*` variables, not from people.

## Server Requirements

The server must have a local postfix relay configured and running on `SMTP_HOST:SMTP_PORT`. The relay handles TLS and authentication to the upstream mail server. No credentials are needed in the app — the relay trusts the server's IP.

On the Oregonian deployment, the relay forwards to `relay-aws.advancelocal.net`.
