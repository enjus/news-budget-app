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
import { linkHref, visualLinks } from "@/lib/visual-requests"
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
  /** Read through visualLinks(), with the legacy dataUrl as fallback. */
  links?: readonly string[] | null
  dataUrl?: string | null
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

/** A row in the plain-text body: "Label: value", or "Label:" then the value's own lines when it starts with one. */
function rowText(r: Row): string {
  return r.text.startsWith("\n") ? `${r.label}:${r.text}` : `${r.label}: ${r.text}`
}

/**
 * The "Link" / "Links" row: one link inline, several one per line. Links were
 * validated on write; each is re-checked (linkHref) before it becomes an href,
 * and one that somehow fails is shown as text. Null when there are none.
 */
function linksRow(visual: { links?: readonly string[] | null; dataUrl?: string | null }): Row | null {
  const links = visualLinks(visual)
  if (links.length === 0) return null
  const html = links.map((link) => {
    const href = linkHref(link)
    return href ? `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>` : escapeHtml(link)
  })
  if (links.length === 1) return { label: "Link", text: links[0], html: html[0] }
  return {
    label: "Links",
    text: links.map((l) => `\n- ${l}`).join(""),
    html: html.join("<br>"),
  }
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
    ? `Visuals Request URGENT (${label}): ${name}`
    : `Visuals Request (${label}): ${name}`

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

  const rows: Row[] = [
    row("Type", label),
    urgent ? row("Priority", "Urgent") : null,
    row("What's needed", v.description),
    row("Event", v.eventDateTime ? formatPubDate(v.eventDateTime, false) : null),
    row("Location", v.location),
    row("Needed by", v.deadline ? formatPubDate(v.deadline, false) : null),
    linksRow(v),
    row("Notes", v.notes),
  ].filter((r): r is Row => r !== null)

  const text =
    `${lead}\n\n` +
    (story ? `${story.slug}: ${story.budgetLine}\n\n` : "") +
    rows.map(rowText).join("\n") +
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
  const subject = `Visuals Request: story deleted: ${group.story.slug}`
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

// ─── Requester notice (decline / delivery) ────────────────────────────────────

/** The outcomes the requester hears about (slice 3, decision 2). Assignment and progress send nothing. */
export const REQUESTER_NOTICE_STATUSES: readonly string[] = ["DECLINED", "DELIVERED"]

/**
 * Who to tell that a request was declined or delivered: the requester, through
 * the usual notifiableEmail() rule (active staff with an email), unless they
 * made the change themselves. `actorPersonId` is the session's personId (null
 * for an unlinked account, which never matches).
 */
export function requesterNoticeRecipient(
  visual: { requestedById: string | null; requestedBy: NotifiablePerson | null },
  actorPersonId: string | null,
): string | null {
  if (!visual.requestedById || !visual.requestedBy) return null
  if (actorPersonId !== null && visual.requestedById === actorPersonId) return null
  return notifiableEmail(visual.requestedBy)
}

/** What the requester's decline/delivery email needs. */
export interface RequesterNoticeInput {
  id: string
  type: string
  status: string
  description: string | null
  declineReason: string | null
  /** The requester's own links, read through visualLinks() (legacy dataUrl as fallback). */
  links?: readonly string[] | null
  dataUrl?: string | null
  story: { id: string; slug: string; budgetLine: string } | null
  /** The assignee: on delivery, who delivered it (the credit). */
  person: { name: string } | null
  /** Who made the change, for "declined by". */
  actorName: string
}

/**
 * The requester's email when their request is declined (with the reason) or
 * delivered. Same shape as the desk email: subject names the story slug, or
 * the description for a standalone request; links to the request page and, for
 * a story request, the story. Returns null for any other status.
 */
export function requesterNoticeEmail(v: RequesterNoticeInput): EmailContent | null {
  if (!REQUESTER_NOTICE_STATUSES.includes(v.status)) return null
  const label = typeLabel(v.type)
  const noun = label.toLowerCase()
  const delivered = v.status === "DELIVERED"
  const name = v.story ? v.story.slug : truncateAtWord(v.description || `${label} request`, STANDALONE_SUBJECT_MAX)
  const subject = delivered
    ? `Visuals Request delivered (${label}): ${name}`
    : `Visuals Request declined (${label}): ${name}`

  const lead = delivered
    ? v.person
      ? `Your ${noun} request was delivered by ${v.person.name}.`
      : `Your ${noun} request was marked delivered.`
    : `Your ${noun} request was declined by ${v.actorName}.`

  const requestLink = `${APP_URL}/requests/${v.id}`
  const storyLink = v.story ? `${APP_URL}/stories/${v.story.id}` : null

  const rows: Row[] = [
    row("You asked for", v.description),
    linksRow(v),
    delivered ? null : row("Reason", v.declineReason),
  ].filter((r): r is Row => r !== null)

  const closing = delivered
    ? v.story
      ? null
      : "It isn't attached to a story yet. Attach it to one from its request page."
    : "If you still need it, talk to the visuals desk or file a new request."

  const text =
    `${lead}\n\n` +
    (v.story ? `${v.story.slug}: ${v.story.budgetLine}\n\n` : "") +
    rows.map(rowText).join("\n") +
    (closing ? `\n\n${closing}` : "") +
    `\n\nView the request: ${requestLink}` +
    (storyLink ? `\nView the story: ${storyLink}` : "")

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    (v.story ? `<p><strong>${escapeHtml(v.story.slug)}:</strong> ${escapeHtml(v.story.budgetLine)}</p>` : "") +
    rows.map((r) => `<p><strong>${escapeHtml(r.label)}:</strong> ${r.html}</p>`).join("") +
    (closing ? `<p>${escapeHtml(closing)}</p>` : "") +
    `<p><a href="${requestLink}">View the request in the News Budget</a>` +
    (storyLink ? ` · <a href="${storyLink}">View the story</a>` : "") +
    `</p>`

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
