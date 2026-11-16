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

Filing a visual request (`POST /api/stories/[id]/visuals` with `status: "REQUESTED"`) emails the desk for that visual type. Recipients come from runtime env vars, read at send time, so changing a desk address is a `.env` edit and a restart, not a rebuild:

| Variable | Used for |
|----------|----------|
| `VISUAL_REQUEST_EMAILS_PHOTO` | Photo requests |
| `VISUAL_REQUEST_EMAILS_GRAPHIC` | Graphic **and Map** requests |
| `VISUAL_REQUEST_EMAILS_VIDEO` | Video requests (decided value: the same address as `_PHOTO`, kept separate so it can diverge) |

Each is a comma-separated list; whitespace is trimmed and duplicates dropped. If the list for a type is empty, the send is logged and skipped and the request is still filed. The email is fire-and-forget: a failure never fails the API call.

**Subject**: `News Budget visual request (Photo): {slug}`, or `URGENT visual request (Photo): {slug}` for urgent requests. **Body**: the requester, slug and budget line, then type, priority (urgent only), what's needed, event time, location, needed-by, data link, and notes (blank fields omitted), and a link to the story. Event and needed-by times follow the pub-date convention (newsroom time encoded as UTC).

Code: `src/lib/visual-notifications.ts` (`deskRecipients()`, `visualRequestEmail()`, `notifyVisualDesk()`); spec in `docs/visual-requests-slice-2.md`.

### Story-delete notices to visual assignees

When a story is deleted — by hand (`DELETE /api/stories/[id]`) or by the nightly purge (`/api/cron/purge-shelved`) — each assignee of an ASSIGNED or IN_PROGRESS visual on it gets one email, subject `News Budget story deleted: {slug}`, listing their visuals: an ASSIGNED one was removed with the story; an IN_PROGRESS one was kept but is no longer attached to a story. Recipients follow the usual rule (active staff with an email, `notifiableEmail()`). The notices are read inside the delete transaction and sent only after it commits. The API route sends fire-and-forget; the cron awaits the sends and reports `notified` in its response, and still emails the assignees of already-deleted batches if a later batch fails.

Code: `notifyVisualAssigneesOfStoryDelete()` in `src/lib/visual-notifications.ts`, fed by `settleVisualsForStoryDelete()` in `src/lib/story-delete.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/email.ts` | Nodemailer transport; `sendEmail(params)` function |
| `src/lib/notifications.ts` | `notifyStoryUpdated()` — builds and sends story update emails |
| `src/lib/visual-notifications.ts` | `notifyVisualDesk()` — desk email when a visual is requested; `notifyVisualAssigneesOfStoryDelete()` — assignee notice when a story with assigned visuals is deleted |

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

**Seeded people aren't staff.** Every notification recipient must pass `notifiableEmail()` (active, `isStaff: true`, with an email), and `prisma/seed.ts` creates people with `isStaff` false. To test story-update, comment, or story-delete emails locally, set `isStaff = true` (and an email) on the assignee first, e.g. in Prisma Studio or with `UPDATE "Person" SET "isStaff" = true WHERE id = '...'`. The visual-request desk email is unaffected: its recipients come from the `VISUAL_REQUEST_EMAILS_*` variables, not from people.

## Server Requirements

The server must have a local postfix relay configured and running on `SMTP_HOST:SMTP_PORT`. The relay handles TLS and authentication to the upstream mail server. No credentials are needed in the app — the relay trusts the server's IP.

On the Oregonian deployment, the relay forwards to `relay-aws.advancelocal.net`.
