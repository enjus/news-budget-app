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

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/email.ts` | Nodemailer transport; `sendEmail(params)` function |
| `src/lib/notifications.ts` | `notifyStoryUpdated()` — builds and sends story update emails |

## Local Testing

Use [MailHog](https://github.com/mailhog/MailHog) to capture emails without delivering them:

```bash
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

```env
SMTP_HOST=localhost
SMTP_PORT=1025
```

Open http://localhost:8025 to view captured emails.

## Server Requirements

The server must have a local postfix relay configured and running on `SMTP_HOST:SMTP_PORT`. The relay handles TLS and authentication to the upstream mail server. No credentials are needed in the app — the relay trusts the server's IP.

On the Oregonian deployment, the relay forwards to `relay-aws.advancelocal.net`.
