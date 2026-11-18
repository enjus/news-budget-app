// Visual request emails (issue #23, slices 2–3): the desk email sent when a
// request is filed, and the assignee notice sent when a story with assigned
// visuals is deleted. Recipient selection (including the /admin/visual-requests
// routing table, passed in as rows) and subject/body building are pure and
// unit-tested. The one sender here, for story-delete notices, calls sendEmail();
// the desk sender reads the table and lives in visual-desk-routing-server.ts.
// Specs: docs/visual-requests-slice-2.md, docs/visual-requests-slice-3.md.
import { sendEmail } from "@/lib/email"
import { APP_URL, escapeHtml, notifiableEmail, truncateAtWord, type NotifiablePerson } from "@/lib/notifications"
import { formatPubDate } from "@/lib/utils"
import { parseDataUrl } from "@/lib/visual-requests"
import { VISUAL_TYPE_LABELS } from "@/lib/visual-types"

// Desk routing (recipient resolution and list validation) has no mail
// dependency, so the admin page can use it in the browser. Re-exported here so
// existing imports keep working.
export * from "@/lib/visual-desk-routing"

export interface EmailContent {
  subject: string
  text: string
  html: string
}

// ─── Desk email ───────────────────────────────────────────────────────────────

/** Longest description prefix used as a standalone request's subject (same cut as pitch subjects). */
const STANDALONE_SUBJECT_MAX = 55

/** What the desk email needs: the request plus its story (null when standalone) and requester. */
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
  story: { id: string; slug: string; budgetLine: string } | null
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
 * details as label/value rows, and links. Every desk email links to the
 * request page, where the desk works it; a story request also links to the
 * story. A standalone request (no story) takes its subject from the
 * description, since there's no slug.
 */
export function visualRequestEmail(v: VisualRequestEmailInput): EmailContent {
  const label = typeLabel(v.type)
  const urgent = v.priority === "URGENT"
  const story = v.story
  const name = story ? story.slug : truncateAtWord(v.description || `${label} request`, STANDALONE_SUBJECT_MAX)
  const subject = urgent
    ? `URGENT visual request (${label}): ${name}`
    : `News Budget visual request (${label}): ${name}`

  const noun = label.toLowerCase()
  const lead = story
    ? v.requestedBy
      ? `${v.requestedBy.name} requested a ${noun} for a story in the News Budget.`
      : `A ${noun} was requested for a story in the News Budget.`
    : v.requestedBy
      ? `${v.requestedBy.name} requested a ${noun} in the News Budget. It isn't attached to a story yet.`
      : `A ${noun} was requested in the News Budget. It isn't attached to a story yet.`

  const requestLink = `${APP_URL}/requests/${v.id}`
  const storyLink = story ? `${APP_URL}/stories/${story.id}` : null

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
    (story ? `${story.slug}: ${story.budgetLine}\n\n` : "") +
    rows.map((r) => `${r.label}: ${r.text}`).join("\n") +
    `\n\nView the request: ${requestLink}` +
    (storyLink ? `\nView the story: ${storyLink}` : "")

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    (story ? `<p><strong>${escapeHtml(story.slug)}:</strong> ${escapeHtml(story.budgetLine)}</p>` : "") +
    rows.map((r) => `<p><strong>${escapeHtml(r.label)}:</strong> ${r.html}</p>`).join("") +
    `<p><a href="${requestLink}">View the request in the News Budget</a>` +
    (storyLink ? ` · <a href="${storyLink}">View the story</a>` : "") +
    `</p>`

  return { subject, text, html }
}

// ─── Story-delete assignee notice ─────────────────────────────────────────────

/** A visual whose assignee should hear that its story was deleted: ASSIGNED or IN_PROGRESS only. */
export interface DeletedStoryNotice {
  /** The visual's id: an IN_PROGRESS one survives as unplaced, and its notice links to its request page. */
  id: string
  type: string
  status: string
  person: (NotifiablePerson & { name: string }) | null
  story: { id: string; slug: string; budgetLine: string }
}

/** Statuses whose assignee gets a notice. REQUESTED has no assignee; the rest are credits or over. */
export const STORY_DELETE_NOTICE_STATUSES: readonly string[] = ["ASSIGNED", "IN_PROGRESS"]

/** One visual's line in a notice; `href` is set when there's somewhere to go (the request page). */
export interface NoticeLine {
  text: string
  href?: string
}

/** One recipient's notice: every line is one of their visuals on the deleted story. */
export interface StoryDeletedGroup {
  email: string
  name: string
  story: { id: string; slug: string; budgetLine: string }
  lines: NoticeLine[]
}

/** How a deleted story's sender is described in the notice. */
export const PURGE_ACTOR = "the nightly purge of stories shelved more than 90 days"

function noticeLine(n: DeletedStoryNotice): NoticeLine | null {
  const label = typeLabel(n.type)
  switch (n.status) {
    case "ASSIGNED":
      return { text: `${label} (assigned): this assignment was removed with the story.` }
    case "IN_PROGRESS":
      // The visual survives unplaced (storyId = null); its request page is
      // where it gets attached to another story.
      return {
        text: `${label} (in progress): your visual was kept and is now unplaced. Attach it to another story from its request page:`,
        href: `${APP_URL}/requests/${n.id}`,
      }
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
 * manual delete, or PURGE_ACTOR for the cron. No link to the story (it's
 * gone); an in-progress visual's line links to its request page.
 */
export function storyDeletedEmail(group: StoryDeletedGroup, deletedBy: string): EmailContent {
  const subject = `News Budget story deleted: ${group.story.slug}`
  const lead = "A story you have a visual assignment on was deleted from the News Budget."

  const text =
    `${lead}\n\n` +
    `${group.story.slug}: ${group.story.budgetLine}\n\n` +
    `Your visuals on it:\n` +
    group.lines.map((l) => `- ${l.text}${l.href ? ` ${l.href}` : ""}`).join("\n") +
    `\n\nDeleted by: ${deletedBy}`

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    `<p><strong>${escapeHtml(group.story.slug)}:</strong> ${escapeHtml(group.story.budgetLine)}</p>` +
    `<p><strong>Your visuals on it:</strong></p>` +
    `<ul>${group.lines
      .map((l) => `<li>${escapeHtml(l.text)}${l.href ? ` <a href="${escapeHtml(l.href)}">${escapeHtml(l.href)}</a>` : ""}</li>`)
      .join("")}</ul>` +
    `<p><strong>Deleted by:</strong> ${escapeHtml(deletedBy)}</p>`

  return { subject, text, html }
}

// ─── Senders ──────────────────────────────────────────────────────────────────

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
