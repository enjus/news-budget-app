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
}

interface CommentNotification {
  item: CommentedItem;
  kind: "story" | "video";
  authorName: string;
  body: string;
  recipients: string[];
}

function commentLink(kind: "story" | "video", id: string): string {
  return `${APP_URL}/${kind === "story" ? "stories" : "videos"}/${id}`;
}

function commentEmail(
  { item, kind, authorName, body }: CommentNotification,
  lead: string
) {
  const link = commentLink(kind, item.id);

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
    `${authorName} mentioned you in a comment on a ${kind} in the News Budget.`
  );
  await sendEmail({
    to: notification.recipients,
    subject: `You were mentioned on ${item.slug}`,
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
  const { text, html } = commentEmail(
    notification,
    `${authorName} commented on a ${kind} you're assigned to in the News Budget.`
  );
  await sendEmail({
    to: notification.recipients,
    subject: `New comment on ${item.slug}`,
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
