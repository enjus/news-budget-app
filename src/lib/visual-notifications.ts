// Visual request emails (issue #23, slice 2): the desk email sent when a
// request is filed, and the assignee notice sent when a story with assigned
// visuals is deleted. Recipient selection and subject/body building are pure
// and unit-tested; the senders at the bottom read process.env and call
// sendEmail(), and are the only impure part. Spec: docs/visual-requests-slice-2.md.

import { sendEmail } from "@/lib/email"
import { APP_URL, escapeHtml, notifiableEmail, type NotifiablePerson } from "@/lib/notifications"
import { formatPubDate } from "@/lib/utils"
import { parseDataUrl } from "@/lib/visual-requests"
import { VISUAL_TYPE_LABELS } from "@/lib/visual-types"

export interface EmailContent {
  subject: string
  text: string
  html: string
}

// ─── Desk recipients ──────────────────────────────────────────────────────────

/** Env var holding each type's desk list. Map has no desk of its own and reads the graphic list. */
export const DESK_EMAIL_ENV: Record<string, string> = {
  PHOTO: "VISUAL_REQUEST_EMAILS_PHOTO",
  GRAPHIC: "VISUAL_REQUEST_EMAILS_GRAPHIC",
  MAP: "VISUAL_REQUEST_EMAILS_GRAPHIC",
  VIDEO: "VISUAL_REQUEST_EMAILS_VIDEO",
}

/**
 * Split a comma-separated address list: trimmed, blanks dropped, duplicates
 * removed case-insensitively (first spelling wins). No syntax check beyond
 * that — the relay rejects a bad address and sendEmail() logs it.
 */
export function parseEmailList(raw: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim()
    const key = email.toLowerCase()
    if (!email || seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out
}

/**
 * The desk addresses for a visual type, read from `env` (the caller passes
 * process.env; tests pass a plain object). Empty when the type has no desk or
 * its list is unset — the caller logs and skips rather than failing.
 */
export function deskRecipients(type: string, env: Record<string, string | undefined>): string[] {
  const key = DESK_EMAIL_ENV[type]
  return key ? parseEmailList(env[key]) : []
}

// ─── Desk email ───────────────────────────────────────────────────────────────

/** What the desk email needs: the request plus its story and requester. */
export interface VisualRequestEmailInput {
  id: string
  type: string
  priority: string
  description: string | null
  /** Newsroom time encoded as UTC, like pub dates. */
  eventDateTime: Date | string | null
  location: string | null
  /** Newsroom time encoded as UTC, like pub dates. */
  deadline: Date | string | null
  notes: string | null
  dataUrl: string | null
  story: { id: string; slug: string; budgetLine: string }
  requestedBy: { name: string } | null
}

function typeLabel(type: string): string {
  return (VISUAL_TYPE_LABELS as Record<string, string>)[type] ?? type
}

/** Label/value rows for the body, in display order; null values are left out. */
type Row = { label: string; text: string; html: string }

function row(label: string, value: string | null | undefined): Row | null {
  if (!value) return null
  return { label, text: value, html: escapeHtml(value).replace(/\n/g, "<br>") }
}

/**
 * The desk email for a newly filed request. Same shape as the story-update
 * email in notifications.ts: a one-line lead, the slug and budget line, the
 * details as label/value rows, and a link to the story (there is no request
 * page yet — the story's Visuals section shows the request).
 */
export function visualRequestEmail(v: VisualRequestEmailInput): EmailContent {
  const label = typeLabel(v.type)
  const urgent = v.priority === "URGENT"
  const subject = urgent
    ? `URGENT visual request (${label}): ${v.story.slug}`
    : `News Budget visual request (${label}): ${v.story.slug}`

  const lead = v.requestedBy
    ? `${v.requestedBy.name} requested a ${label.toLowerCase()} for a story in the News Budget.`
    : `A ${label.toLowerCase()} was requested for a story in the News Budget.`

  const link = `${APP_URL}/stories/${v.story.id}`

  // dataUrl was validated on write; re-check before emitting an href (defense
  // in depth, same rule as the UI). A link that somehow fails is shown as text.
  const parsedLink = v.dataUrl ? parseDataUrl(v.dataUrl) : null
  const safeHref = parsedLink && parsedLink.ok ? parsedLink.value : null

  const rows: Row[] = [
    row("Type", label),
    urgent ? row("Priority", "Urgent") : null,
    row("What's needed", v.description),
    row("Event", v.eventDateTime ? formatPubDate(v.eventDateTime, false) : null),
    row("Location", v.location),
    row("Needed by", v.deadline ? formatPubDate(v.deadline, false) : null),
    v.dataUrl
      ? {
          label: "Data",
          text: v.dataUrl,
          html: safeHref
            ? `<a href="${escapeHtml(safeHref)}">${escapeHtml(safeHref)}</a>`
            : escapeHtml(v.dataUrl),
        }
      : null,
    row("Notes", v.notes),
  ].filter((r): r is Row => r !== null)

  const text =
    `${lead}\n\n` +
    `${v.story.slug}: ${v.story.budgetLine}\n\n` +
    rows.map((r) => `${r.label}: ${r.text}`).join("\n") +
    `\n\nView the story: ${link}`

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    `<p><strong>${escapeHtml(v.story.slug)}:</strong> ${escapeHtml(v.story.budgetLine)}</p>` +
    rows.map((r) => `<p><strong>${escapeHtml(r.label)}:</strong> ${r.html}</p>`).join("") +
    `<p><a href="${link}">View the story in the News Budget</a></p>`

  return { subject, text, html }
}

// ─── Story-delete assignee notice ─────────────────────────────────────────────

/** A visual whose assignee should hear that its story was deleted: ASSIGNED or IN_PROGRESS only. */
export interface DeletedStoryNotice {
  type: string
  status: string
  person: (NotifiablePerson & { name: string }) | null
  story: { id: string; slug: string; budgetLine: string }
}

/** Statuses whose assignee gets a notice. REQUESTED has no assignee; the rest are credits or over. */
export const STORY_DELETE_NOTICE_STATUSES: readonly string[] = ["ASSIGNED", "IN_PROGRESS"]

/** One recipient's notice: every line is one of their visuals on the deleted story. */
export interface StoryDeletedGroup {
  email: string
  name: string
  story: { id: string; slug: string; budgetLine: string }
  lines: string[]
}

/** How a deleted story's sender is described in the notice. */
export const PURGE_ACTOR = "the nightly purge of stories shelved more than 90 days"

function noticeLine(n: DeletedStoryNotice): string | null {
  const label = typeLabel(n.type)
  switch (n.status) {
    case "ASSIGNED":
      return `${label} (assigned): this assignment was removed with the story.`
    case "IN_PROGRESS":
      // Slice 3's dashboard doesn't exist yet, so don't point at it; update this
      // line to link to /requests when it ships.
      return `${label} (in progress): your visual was kept but is no longer attached to a story. Contact the visuals desk if it needs a new home.`
    default:
      return null
  }
}

/**
 * Group the notices by recipient: one email per active staffer (notifiableEmail
 * rule), even if they hold several visuals on the story, keyed by lower-cased
 * email. Rows with no assignee, a non-notifiable assignee, or a status outside
 * STORY_DELETE_NOTICE_STATUSES are dropped. Rows from several stories (the
 * purge cron) make one group per person *per story*.
 */
export function storyDeletedNotices(notices: DeletedStoryNotice[]): StoryDeletedGroup[] {
  const groups = new Map<string, StoryDeletedGroup>()
  for (const n of notices) {
    const line = noticeLine(n)
    const email = notifiableEmail(n.person)
    if (!line || !email || !n.person) continue
    const key = `${email.toLowerCase()}|${n.story.id}`
    let group = groups.get(key)
    if (!group) {
      group = { email, name: n.person.name, story: n.story, lines: [] }
      groups.set(key, group)
    }
    group.lines.push(line)
  }
  return Array.from(groups.values())
}

/**
 * The notice for one recipient. `deletedBy` is the session user's name for a
 * manual delete, or PURGE_ACTOR for the cron. No link: the story is gone.
 */
export function storyDeletedEmail(group: StoryDeletedGroup, deletedBy: string): EmailContent {
  const subject = `News Budget story deleted: ${group.story.slug}`
  const lead = "A story you have a visual assignment on was deleted from the News Budget."

  const text =
    `${lead}\n\n` +
    `${group.story.slug}: ${group.story.budgetLine}\n\n` +
    `Your visuals on it:\n` +
    group.lines.map((l) => `- ${l}`).join("\n") +
    `\n\nDeleted by: ${deletedBy}`

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    `<p><strong>${escapeHtml(group.story.slug)}:</strong> ${escapeHtml(group.story.budgetLine)}</p>` +
    `<p><strong>Your visuals on it:</strong></p>` +
    `<ul>${group.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` +
    `<p><strong>Deleted by:</strong> ${escapeHtml(deletedBy)}</p>`

  return { subject, text, html }
}

// ─── Senders ──────────────────────────────────────────────────────────────────

/**
 * Email the desk for a newly filed request. Fire-and-forget from the POST
 * visuals route: the request is already saved, and nothing here throws past
 * sendEmail() (which logs and returns false). With no list configured for the
 * type (VISUAL_REQUEST_EMAILS_*), it logs and skips — the request still stands.
 */
export async function notifyVisualDesk(visual: VisualRequestEmailInput): Promise<void> {
  const recipients = deskRecipients(visual.type, process.env)
  if (recipients.length === 0) {
    console.warn(`Visual request desk email skipped: no recipients configured for ${visual.type} (visual ${visual.id})`)
    return
  }
  const { subject, text, html } = visualRequestEmail(visual)
  await sendEmail({ to: recipients, subject, text, html })
}

/**
 * Tell each assignee of an ASSIGNED / IN_PROGRESS visual that its story was
 * deleted: one email per person per story. `deletedBy` is the session user's
 * name, or PURGE_ACTOR from the cron. Never throws — every send goes through
 * sendEmail() (which logs and returns false) under allSettled — so the API
 * route can fire-and-forget it and the cron can await it safely. Returns the
 * number of emails that were sent.
 */
export async function notifyVisualAssigneesOfStoryDelete(
  notices: DeletedStoryNotice[],
  deletedBy: string,
): Promise<number> {
  const groups = storyDeletedNotices(notices)
  if (groups.length === 0) return 0
  const results = await Promise.allSettled(
    groups.map((group) => sendEmail({ to: [group.email], ...storyDeletedEmail(group, deletedBy) }))
  )
  return results.filter((r) => r.status === "fulfilled" && r.value).length
}
