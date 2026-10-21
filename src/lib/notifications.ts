import { sendEmail } from "@/lib/email";
import { linkifyToHtml } from "@/lib/comment-text";

/**
 * The base URL of the app, used to build links back to items in emails.
 * e.g. https://ornews-advancelocal.msappproxy.net/news-budget
 */
const APP_URL =
  process.env.APP_PUBLIC_URL ||
  "https://ornews-advancelocal.msappproxy.net/news-budget";

/** Minimal shape of an assigned person we need for notifications. */

export interface AssignedPerson {
  person: { name: string; email: string | null; isActive: boolean };
  role: string;
}
/** Minimal shape of a visual element's credited person. */
interface CreditedVisual {
  person: { name: string; email: string | null; isActive: boolean } | null;
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

  const notesLine = story.notes ? `\n\nNotes: ${story.notes}` : "";
  const text =
    `A story you're assigned to has been updated in the News Budget.\n\n` +
    `${story.slug}: ${story.budgetLine}${notesLine}\n\n` +
    `View it here: ${link}`;

  const html =
    `<p>A story you're assigned to has been updated in the News Budget.</p>` +
    `<p><strong>${escapeHtml(story.slug)}:</strong> ${escapeHtml(story.budgetLine)}</p>` +
    (story.notes
      ? `<p><strong>Notes:</strong> ${escapeHtml(story.notes).replace(/\n/g, "<br>")}</p>`
      : "") +
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

  const notesLine = video.notes ? `\n\nNotes: ${video.notes}` : "";
  const text =
    `A video you're assigned to has been updated in the News Budget.\n\n` +
    `${video.slug}: ${video.budgetLine}${notesLine}\n\n` +
    `View it here: ${link}`;

  const html =
    `<p>A video you're assigned to has been updated in the News Budget.</p>` +
    `<p><strong>${escapeHtml(video.slug)}:</strong> ${escapeHtml(video.budgetLine)}</p>` +
    (video.notes
      ? `<p><strong>Notes:</strong> ${escapeHtml(video.notes).replace(/\n/g, "<br>")}</p>`
      : "") +
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
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > 0 ? cut.slice(0, lastSpace) : clean.slice(0, max);
  return head.replace(/[\s\p{P}\p{S}]+$/u, "") + "…";
}

/**
 * "Claimed by Marcus Lee · Expires Wed, Oct 28". expiresAt is a genuine
 * instant (not newsroom-time-as-UTC like pub dates), so it's formatted in
 * Pacific time. The date is absolute rather than "5 days left" so an old
 * email doesn't go stale.
 */
export function pitchStatusLine(pitch: PitchInfo, now = new Date()): string {
  const claim = pitch.claimantName ? `Claimed by ${pitch.claimantName}` : "Unclaimed";
  if (!pitch.expiresAt) return `${claim} · Evergreen`;
  const tz = "America/Los_Angeles";
  const year = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(year(pitch.expiresAt) === year(now) ? {} : { year: "numeric" as const }),
  }).format(pitch.expiresAt);
  return `${claim} · Expires ${date}`;
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

/** Subject line naming the item: the slug, or "Pitch: …" plus the tip's start. */
function commentSubject(item: CommentedItem, prefix: string): string {
  return item.pitch
    ? `Pitch: ${prefix} ${truncateAtWord(item.pitch.text, PITCH_SUBJECT_MAX)}`
    : `${prefix} ${item.slug}`;
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
  const noun = item.pitch ? "pitch" : kind;
  const { text, html } = commentEmail(
    notification,
    `${authorName} mentioned you in a comment on a ${noun} in the News Budget.`
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
  // One email goes to the whole team, which on a pitch can include visual
  // credits as well as the claimant — so the wording can't say "you claimed".
  const lead = item.pitch
    ? `${authorName} commented on a pitch you're working on in the News Budget.`
    : `${authorName} commented on a ${kind} you're assigned to in the News Budget.`;
  const { text, html } = commentEmail(notification, lead);
  await sendEmail({
    to: notification.recipients,
    subject: commentSubject(item, "New comment on"),
    text,
    html,
  });
}

/** Dedupe + extract valid emails from assignments and (for stories) credited visuals. */
export function collectEmails(assignments: AssignedPerson[], visuals: CreditedVisual[] = []): string[] {
  const emails = new Set<string>();
  for (const a of assignments) {
    if (a.person?.email && a.person.isActive) emails.add(a.person.email);
  }
  for (const v of visuals) {
    if (v.person?.email && v.person.isActive) emails.add(v.person.email);
  }
  return Array.from(emails);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
