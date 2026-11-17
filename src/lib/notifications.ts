import { sendEmail } from "@/lib/email";
import { linkifyToHtml } from "@/lib/comment-text";
import { formatDatePacific, isNotifiablePerson, pacificDateString, todayString } from "@/lib/utils";
import { isNotifiableStatus } from "@/lib/visual-statuses";

/**
 * The base URL of the app, used to build links back to items in emails.
 * e.g. https://ornews-advancelocal.msappproxy.net/news-budget
 */
export const APP_URL =
  process.env.APP_PUBLIC_URL ||
  "https://ornews-advancelocal.msappproxy.net/news-budget";

/** The fields that decide whether a Person can be emailed. */
export interface NotifiablePerson {
  email: string | null;
  isActive: boolean;
  isStaff: boolean;
}

/** Minimal shape of an assigned person we need for notifications. */
export interface AssignedPerson {
  person: NotifiablePerson & { name: string };
  role: string;
}
/** Minimal shape of a visual element's credited person. */
interface CreditedVisual {
  status: string;
  person: (NotifiablePerson & { name: string }) | null;
}

/**
 * The address to email this person at, or null if they get no email.
 * Only active staff are notified: a contributor (isStaff: false) never
 * receives mention, "Notify All", or assignment emails about internal
 * newsroom discussion, even if a Person.email was saved for them. Every
 * notification recipient set goes through this one check.
 */
export function notifiableEmail(person: NotifiablePerson | null | undefined): string | null {
  return isNotifiablePerson(person) ? person!.email : null;
}

interface NotifiableStory {
  id: string;
  slug: string;
  budgetLine: string;
  notes: string | null;
  assignments: AssignedPerson[];
  visuals: CreditedVisual[];
}

interface NotifiableVideo {
  id: string;
  slug: string;
  budgetLine: string;
  notes: string | null;
  assignments: AssignedPerson[];
}

/** Longest notes excerpt included in a team-notification email. Notes can
 *  hold a whole pasted email (up to NOTES_MAX), which shouldn't be blasted
 *  in full to every assignee — the link has the rest. */
export const NOTES_EMAIL_MAX = 3000;

/** Trim notes for an email body, keeping line breaks. Returns the excerpt and
 *  whether anything was cut. Cuts at the last line break or space before the
 *  limit when there's one reasonably close, so a word isn't split. */
export function notesForEmail(notes: string, max = NOTES_EMAIL_MAX): { text: string; truncated: boolean } {
  const trimmed = notes.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return { text: trimmed, truncated: false };
  const head = chars.slice(0, max).join("");
  const breakAt = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(" "));
  const cut = breakAt > max * 0.8 ? head.slice(0, breakAt) : head;
  return { text: cut.trimEnd() + "…", truncated: true };
}

function notesBlocks(notes: string | null | undefined): { text: string; html: string } {
  if (!notes?.trim()) return { text: "", html: "" };
  const { text, truncated } = notesForEmail(notes);
  const more = truncated ? "(Notes shortened — see the full text in the News Budget.)" : "";
  return {
    text: `\n\nNotes: ${text}` + (more ? `\n${more}` : ""),
    html:
      `<p><strong>Notes:</strong> ${escapeHtml(text).replace(/\n/g, "<br>")}</p>` +
      (more ? `<p><em>${more}</em></p>` : ""),
  };
}

/**
 * Notify the people assigned to a story that it needs their attention.
 * Recipients = everyone assigned to the story (via StoryAssignment) plus
 * everyone credited on any of its Visual elements — any update to the
 * story re-notifies both groups, not just whoever's own contribution changed.
 * Fire-and-forget: failures are logged, never thrown.
 */
export async function notifyStoryTeam(story: NotifiableStory): Promise<void> {
  const recipients = collectEmails(story.assignments, story.visuals);
  if (recipients.length === 0) return;

  const link = `${APP_URL}/stories/${story.id}`;
  const subject = `News Budget story updated: ${story.slug}`;

  const notes = notesBlocks(story.notes);
  const text =
    `A story you're assigned to has been updated in the News Budget.\n\n` +
    `${story.slug}: ${story.budgetLine}${notes.text}\n\n` +
    `View it here: ${link}`;

  const html =
    `<p>A story you're assigned to has been updated in the News Budget.</p>` +
    `<p><strong>${escapeHtml(story.slug)}:</strong> ${escapeHtml(story.budgetLine)}</p>` +
    notes.html +
    `<p><a href="${link}">View it in the News Budget</a></p>`;

  await sendEmail({ to: recipients, subject, text, html });
}

/**
 * Notify the people assigned to a video. Mirrors notifyStoryTeam.
 */
export async function notifyVideoTeam(video: NotifiableVideo): Promise<void> {
  const recipients = collectEmails(video.assignments);
  if (recipients.length === 0) return;

  const link = `${APP_URL}/videos/${video.id}`;
  const subject = `News Budget video updated: ${video.slug}`;

  const notes = notesBlocks(video.notes);
  const text =
    `A video you're assigned to has been updated in the News Budget.\n\n` +
    `${video.slug}: ${video.budgetLine}${notes.text}\n\n` +
    `View it here: ${link}`;

  const html =
    `<p>A video you're assigned to has been updated in the News Budget.</p>` +
    `<p><strong>${escapeHtml(video.slug)}:</strong> ${escapeHtml(video.budgetLine)}</p>` +
    notes.html +
    `<p><a href="${link}">View it in the News Budget</a></p>`;

  await sendEmail({ to: recipients, subject, text, html });
}

/** The item a comment was posted on. */
export interface CommentedItem {
  id: string;
  slug: string;
  budgetLine: string;
  /** Set when the item is a pitch (off-budget story with pitchedAt). Its slug
   *  and budgetLine are placeholders derived from the tip, so pitch emails
   *  show the tip and claim status instead. */
  pitch?: PitchInfo;
}

export interface PitchInfo {
  /** The tip as filed (pitchText, falling back to budgetLine). */
  text: string;
  /** Name of whoever claimed it, or null if unclaimed. */
  claimantName: string | null;
  /** Null = evergreen. */
  expiresAt: Date | null;
  /** Shelved (by the purge-shelved cron or by hand) but still a pitch —
   *  pitchedAt is kept so it can be recovered. */
  shelved: boolean;
}

interface CommentNotification {
  item: CommentedItem;
  kind: "story" | "video";
  authorName: string;
  body: string;
  recipients: string[];
}

/** Longest tip prefix shown in a pitch email's subject. */
const PITCH_SUBJECT_MAX = 55;

/**
 * Cut text to at most `max` characters at a word boundary, adding "…" when
 * anything was dropped. Trailing punctuation before the cut ("spring —") is
 * removed so the ellipsis doesn't follow a dangling dash or comma.
 */
export function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  // Count and cut by code point so an emoji at the boundary isn't split.
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  const cut = chars.slice(0, max + 1).join("");
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > 0 ? cut.slice(0, lastSpace) : chars.slice(0, max).join("");
  // Keep the punctuation if it's all there is, rather than an empty subject.
  return (head.replace(/[\s\p{P}]+$/u, "") || head) + "…";
}

/**
 * "Claimed by Marcus Lee · Expires Wed, Oct 28". expiresAt is a genuine
 * instant (not newsroom-time-as-UTC like pub dates), so it's compared and
 * formatted in Pacific time. The date is absolute rather than "5 days left"
 * so an old email doesn't go stale. A past expiry reads "Expired" — a claimed
 * pitch is exempt from the purge cron and can sit past it indefinitely.
 */
export function pitchStatusLine(pitch: PitchInfo, today = todayString()): string {
  const parts = [pitch.claimantName ? `Claimed by ${pitch.claimantName}` : "Unclaimed"];
  if (pitch.shelved) parts.unshift("Shelved");
  if (!pitch.expiresAt) {
    parts.push("Evergreen");
  } else {
    const day = pacificDateString(pitch.expiresAt);
    const date = formatDatePacific(pitch.expiresAt, today);
    parts.push(day < today ? `Expired ${date}` : day === today ? "Expires today" : `Expires ${date}`);
  }
  return parts.join(" · ");
}

function commentLink(kind: "story" | "video", id: string): string {
  return `${APP_URL}/${kind === "story" ? "stories" : "videos"}/${id}`;
}

function commentEmail(
  { item, kind, authorName, body }: CommentNotification,
  lead: string
) {
  const link = commentLink(kind, item.id);

  if (item.pitch) {
    const status = pitchStatusLine(item.pitch);
    const text =
      `${lead}\n\n` +
      `Pitch: ${item.pitch.text}\n` +
      `${status}\n\n` +
      `${authorName} wrote:\n${body}\n\n` +
      `View the pitch: ${link}`;

    const html =
      `<p>${escapeHtml(lead)}</p>` +
      `<p style="margin-bottom:4px"><strong>Pitch</strong></p>` +
      `<blockquote style="margin:0 0 4px;padding-left:12px;border-left:3px solid #ccc">${escapeHtml(item.pitch.text).replace(/\n/g, "<br>")}</blockquote>` +
      `<p style="color:#666;font-size:13px">${escapeHtml(status)}</p>` +
      `<p><strong>${escapeHtml(authorName)} wrote:</strong><br>${linkifyToHtml(body)}</p>` +
      `<p><a href="${link}">View the pitch in the News Budget</a></p>`;

    return { text, html };
  }

  const text =
    `${lead}\n\n` +
    `${item.slug}: ${item.budgetLine}\n\n` +
    `${authorName} wrote:\n${body}\n\n` +
    `View it here: ${link}`;

  const html =
    `<p>${escapeHtml(lead)}</p>` +
    `<p><strong>${escapeHtml(item.slug)}:</strong> ${escapeHtml(item.budgetLine)}</p>` +
    `<p><strong>${escapeHtml(authorName)} wrote:</strong><br>${linkifyToHtml(body)}</p>` +
    `<p><a href="${link}">View it in the News Budget</a></p>`;

  return { text, html };
}

/** Subject line naming the item: the slug, or "pitch: " plus the tip's start. */
function commentSubject(item: CommentedItem, prefix: string): string {
  return item.pitch
    ? `${prefix} pitch: ${truncateAtWord(item.pitch.text, PITCH_SUBJECT_MAX)}`
    : `${prefix} ${item.slug}`;
}

/** "a story", "a video", "a pitch" or "a shelved pitch". */
function itemNoun(item: CommentedItem, kind: "story" | "video"): string {
  if (!item.pitch) return `a ${kind}`;
  return item.pitch.shelved ? "a shelved pitch" : "a pitch";
}

/**
 * Notify People tagged in a comment. Sent on both "Post" and "Post and Notify All".
 * Fire-and-forget: failures are logged, never thrown.
 */
export async function notifyCommentMention(
  notification: CommentNotification
): Promise<void> {
  if (notification.recipients.length === 0) return;
  const { item, kind, authorName } = notification;
  const { text, html } = commentEmail(
    notification,
    `${authorName} mentioned you in a comment on ${itemNoun(item, kind)} in the News Budget.`
  );
  await sendEmail({
    to: notification.recipients,
    subject: commentSubject(item, "You were mentioned on"),
    text,
    html,
  });
}

/**
 * Notify everyone assigned to the item ("Post and Notify All"). Recipients are
 * computed by the caller, which excludes anyone already emailed as a mention
 * and the comment's own author.
 */
export async function notifyCommentTeam(
  notification: CommentNotification
): Promise<void> {
  if (notification.recipients.length === 0) return;
  const { item, kind, authorName } = notification;
  // One email goes to the whole team, which on a pitch can be visual credits
  // with no claimant at all — so pitch wording doesn't claim any relationship.
  const lead = item.pitch
    ? `${authorName} commented on ${itemNoun(item, kind)} in the News Budget.`
    : `${authorName} commented on a ${kind} you're assigned to in the News Budget.`;
  const { text, html } = commentEmail(notification, lead);
  await sendEmail({
    to: notification.recipients,
    subject: commentSubject(item, "New comment on"),
    text,
    html,
  });
}

/**
 * Dedupe + extract notifiable emails (see notifiableEmail) from assignments and
 * (for stories) credited visuals. A visual counts only in a NOTIFIABLE status:
 * a merely-requested one has no assignee to tell, and declined/canceled ones
 * are off the story. Every person, assignee or credit, must still pass
 * notifiableEmail() (active staff with an email).
 */
export function collectEmails(assignments: AssignedPerson[], visuals: CreditedVisual[] = []): string[] {
  const emails = new Set<string>();
  const people = [
    ...assignments.map((a) => a.person),
    ...visuals.filter((v) => isNotifiableStatus(v.status)).map((v) => v.person),
  ];
  for (const p of people) {
    const email = notifiableEmail(p);
    if (email) emails.add(email);
  }
  return Array.from(emails);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
