# Email Notifications Setup — "Save & Notify Team"

## Current State

The "Save & Notify Team" buttons on story and video detail pages set `notifyTeam: true` on the saved record, but **no email is actually sent**. The flag is persisted to the database and nothing else happens.

This document describes how to implement email sending via SMTP using **Nodemailer**, targeting **Microsoft 365 / Exchange Online** as the primary SMTP provider.

## Architecture Overview

```
User clicks "Save & Notify Team"
  → StoryForm/VideoForm submits with notifyTeam: true
    → PUT /api/stories/[id] or PUT /api/videos/[id]
      → Save to DB (existing)
      → If notifyTeam === true:
        → Collect recipient list (assignments + visual assignees)
        → Send email via Nodemailer SMTP transport
        → Reset notifyTeam to false after sending
```

## 1. Install Nodemailer

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

## 2. Environment Variables

Add to `.env`:

```env
# SMTP configuration for "Save & Notify Team" (Microsoft 365)
SMTP_HOST="smtp.office365.com"
SMTP_PORT=587
SMTP_USER="notifications@yourorg.com"
SMTP_PASS="your-password-or-app-password"
SMTP_FROM="News Budget <notifications@yourorg.com>"
```

Add to `.env.example` as well (without real values).

### Microsoft 365 / Exchange Online Setup

1. **Enable SMTP AUTH** for the sending account:
   - Go to **Microsoft 365 Admin Center** → **Users** → **Active users** → select the sender account
   - Click **Mail** → **Manage email apps** → check **Authenticated SMTP** → **Save changes**
   - Alternatively, enable via PowerShell: `Set-CASMailbox -Identity "notifications@yourorg.com" -SmtpClientAuthenticationDisabled $false`

2. **If MFA is enabled** on the sending account (recommended), create an App Password:
   - Sign in at https://mysignins.microsoft.com/security-info
   - Click **Add sign-in method** → **App password** → name it `News Budget SMTP`
   - Use the generated password as `SMTP_PASS`

3. **If your org uses Security Defaults or Conditional Access** that blocks legacy auth:
   - You may need to exclude the sending account from the policy, or
   - Use a **shared mailbox** with SMTP AUTH enabled (shared mailboxes don't consume a license), or
   - Consider Microsoft Graph API as an alternative (see "Alternative: Microsoft Graph API" section below)

4. **Connection details:**
   - Host: `smtp.office365.com`
   - Port: `587` (STARTTLS)
   - Authentication: Basic auth (username + password/app-password)
   - TLS: Required (Nodemailer handles STARTTLS automatically on port 587)

### Alternative Providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| **Microsoft 365** | `smtp.office365.com` | 587 | Default — see setup above |
| Exchange on-premises | Your Exchange server FQDN | 587 | May need internal relay config |
| Amazon SES | `email-smtp.us-east-1.amazonaws.com` | 587 | Requires SES credentials |
| SendGrid | `smtp.sendgrid.net` | 587 | API key as password |

## 3. Create the Email Utility

Create `src/lib/email.ts`:

```ts
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

interface NotifyOptions {
  subject: string
  recipientEmails: string[]
  budgetLine: string
  status: string
  onlinePubDate: string | null
  notes: string | null
  editorName: string  // who clicked "Save & Notify"
  itemUrl: string     // link back to the story/video
  itemType: "story" | "video"
}

export async function sendNotifyTeamEmail(options: NotifyOptions) {
  const {
    subject,
    recipientEmails,
    budgetLine,
    status,
    onlinePubDate,
    notes,
    editorName,
    itemUrl,
    itemType,
  } = options

  if (!process.env.SMTP_HOST || recipientEmails.length === 0) return

  const pubDateLine = onlinePubDate
    ? `Publication date: ${onlinePubDate}`
    : "Publication date: TBD"

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2>${budgetLine}</h2>
      <p><strong>${editorName}</strong> updated this ${itemType} and notified the team.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 4px 8px; color: #666;">Status</td><td style="padding: 4px 8px;">${status}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Pub date</td><td style="padding: 4px 8px;">${pubDateLine}</td></tr>
        ${notes ? `<tr><td style="padding: 4px 8px; color: #666;">Notes</td><td style="padding: 4px 8px;">${notes}</td></tr>` : ""}
      </table>
      <p><a href="${itemUrl}" style="color: #2563eb;">View ${itemType} in News Budget</a></p>
    </div>
  `

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientEmails,
    subject,
    html,
  })
}
```

## 4. Collect Recipients

The recipient list should include everyone assigned to the content, deduplicated by email:

- **Story**: StoryAssignment people + Visual people + VideoAssignment people on linked videos
- **Video**: VideoAssignment people + (if linked to a story) the story's assignment people

Create a helper in `src/lib/email.ts` or a separate file:

```ts
import { prisma } from "@/lib/prisma"

export async function getStoryRecipientEmails(storyId: string): Promise<string[]> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      assignments: { select: { person: { select: { email: true } } } },
      visuals: { select: { person: { select: { email: true } } } },
      videos: {
        select: {
          assignments: { select: { person: { select: { email: true } } } },
        },
      },
    },
  })
  if (!story) return []

  const emails = new Set<string>()
  for (const a of story.assignments) emails.add(a.person.email)
  for (const v of story.visuals) if (v.person) emails.add(v.person.email)
  for (const video of story.videos) {
    for (const a of video.assignments) emails.add(a.person.email)
  }
  return Array.from(emails)
}

export async function getVideoRecipientEmails(videoId: string): Promise<string[]> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      assignments: { select: { person: { select: { email: true } } } },
      story: {
        select: {
          assignments: { select: { person: { select: { email: true } } } },
        },
      },
    },
  })
  if (!video) return []

  const emails = new Set<string>()
  for (const a of video.assignments) emails.add(a.person.email)
  if (video.story) {
    for (const a of video.story.assignments) emails.add(a.person.email)
  }
  return Array.from(emails)
}
```

## 5. Wire Into API Routes

In `src/app/api/stories/[id]/route.ts` (PUT handler), after the successful DB update:

```ts
import { sendNotifyTeamEmail, getStoryRecipientEmails } from "@/lib/email"

// ... inside the PUT handler, after prisma.story.update:

if (result.data.notifyTeam) {
  // Fire-and-forget — don't block the response
  const recipientEmails = await getStoryRecipientEmails(id)
  const session = await getServerSession(authOptions)
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

  sendNotifyTeamEmail({
    subject: `[News Budget] ${updatedStory.budgetLine}`,
    recipientEmails,
    budgetLine: updatedStory.budgetLine,
    status: updatedStory.status,
    onlinePubDate: updatedStory.onlinePubDate?.toISOString() ?? null,
    notes: updatedStory.notes,
    editorName: session?.user?.name ?? "Someone",
    itemUrl: `${baseUrl}/stories/${id}`,
    itemType: "story",
  }).catch((err) => {
    console.error("Failed to send notify email:", err)
  })

  // Reset the flag so the next save doesn't re-notify
  await prisma.story.update({
    where: { id },
    data: { notifyTeam: false },
  })
}
```

Apply the same pattern in `src/app/api/videos/[id]/route.ts` using `getVideoRecipientEmails`.

## 6. Testing

### Verify SMTP connectivity

Create a one-off test script or use the Node REPL:

```bash
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
t.verify().then(() => console.log('SMTP OK')).catch(console.error);
"
```

### Local dev without real SMTP

Use [Ethereal](https://ethereal.email) — a fake SMTP service that captures emails without delivering them:

```env
SMTP_HOST="smtp.ethereal.email"
SMTP_PORT=587
SMTP_USER="your-ethereal-user@ethereal.email"
SMTP_PASS="your-ethereal-password"
SMTP_FROM="News Budget <test@ethereal.email>"
```

Generate credentials at https://ethereal.email/create. Captured emails are viewable in the Ethereal web UI.

### Alternatively: MailHog for fully local testing

```bash
# Install and run MailHog (captures all SMTP traffic on port 1025, web UI on 8025)
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

```env
SMTP_HOST="localhost"
SMTP_PORT=1025
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="News Budget <noreply@localhost>"
```

Open http://localhost:8025 to see captured emails.

## 7. Production Considerations

### Rate limiting

If many users click "Save & Notify" simultaneously, you could hit SMTP rate limits. Consider:
- Queueing emails (e.g., via a simple in-memory queue or a job system)
- Batching multiple recipients into a single email (already done — `to` accepts an array)

### Sender reputation

- Use a dedicated sending domain with SPF, DKIM, and DMARC records configured
- Don't use a personal email as the `From` address in production
- Monitor bounce rates if using a service like SES or SendGrid

### Excluding the sender

You may want to exclude the person who clicked "Save & Notify" from the recipient list so they don't email themselves. To do this, filter out the current session user's email:

```ts
const recipientEmails = (await getStoryRecipientEmails(id))
  .filter((email) => email !== session?.user?.email)
```

### Optional: notification preferences

Add a `notifyOnChange` boolean to the User model if users want to opt out of email notifications individually. Filter the recipient list accordingly.

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (587 for STARTTLS, 465 for SSL) |
| `SMTP_USER` | Yes | SMTP authentication username |
| `SMTP_PASS` | Yes | SMTP authentication password |
| `SMTP_FROM` | No | Sender address (defaults to SMTP_USER) |

If `SMTP_HOST` is not set, the `sendNotifyTeamEmail` function silently no-ops — the app works fine without email configured.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/email.ts` | **Create** — SMTP transport, send function, recipient collectors |
| `src/app/api/stories/[id]/route.ts` | **Modify** — call `sendNotifyTeamEmail` after PUT when `notifyTeam` is true |
| `src/app/api/videos/[id]/route.ts` | **Modify** — same pattern for videos |
| `.env` / `.env.example` | **Modify** — add SMTP variables |

No changes needed to the frontend — the "Save & Notify Team" buttons already set `notifyTeam: true` in the request payload.

## Alternative: Microsoft Graph API

If your organization blocks SMTP AUTH entirely (common with strict Conditional Access policies), you can send email via the Microsoft Graph API instead of SMTP. This uses OAuth 2.0 client credentials (app-only) and doesn't require SMTP AUTH to be enabled.

### Setup

1. In the **Azure App Registration** (same one used for SSO, or a new one):
   - Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
   - Add `Mail.Send`
   - Click **Grant admin consent**

2. Add environment variables:

```env
# Microsoft Graph email (alternative to SMTP)
GRAPH_TENANT_ID="your-tenant-id"        # same as AZURE_AD_TENANT_ID
GRAPH_CLIENT_ID="your-client-id"         # same as AZURE_AD_CLIENT_ID or separate
GRAPH_CLIENT_SECRET="your-client-secret" # same as AZURE_AD_CLIENT_SECRET or separate
GRAPH_SENDER_EMAIL="notifications@yourorg.com"  # must be a real M365 mailbox
```

3. Install the Microsoft Graph SDK:

```bash
npm install @microsoft/microsoft-graph-client @azure/identity
```

4. Create a Graph-based email sender (replace the Nodemailer transport in `src/lib/email.ts`):

```ts
import { ClientSecretCredential } from "@azure/identity"
import { Client } from "@microsoft/microsoft-graph-client"
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials"

function getGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID!,
    process.env.GRAPH_CLIENT_ID!,
    process.env.GRAPH_CLIENT_SECRET!,
  )
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  })
  return Client.initWithMiddleware({ authProvider })
}

export async function sendNotifyTeamEmail(options: NotifyOptions) {
  if (!process.env.GRAPH_TENANT_ID || options.recipientEmails.length === 0) return

  const client = getGraphClient()
  const senderEmail = process.env.GRAPH_SENDER_EMAIL!

  await client.api(`/users/${senderEmail}/sendMail`).post({
    message: {
      subject: options.subject,
      body: { contentType: "HTML", content: buildHtml(options) },
      toRecipients: options.recipientEmails.map((email) => ({
        emailAddress: { address: email },
      })),
    },
  })
}
```

This approach avoids SMTP entirely and works with modern Microsoft 365 security policies. The trade-off is more setup (Graph SDK + app permissions) compared to the simpler SMTP path.
