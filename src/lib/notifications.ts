import { sendEmail } from "@/lib/email";

/**
 * The base URL of the app, used to build links back to items in emails.
 * e.g. https://ornews-advancelocal.msappproxy.net/news-budget
 */
const APP_URL =
  process.env.APP_PUBLIC_URL ||
  "https://ornews-advancelocal.msappproxy.net/news-budget";

/** Minimal shape of an assigned person we need for notifications. */
interface AssignedPerson {
  person: { name: string; email: string };
  role: string;
}

/** Minimal shape of a visual element's credited person. */
interface CreditedVisual {
  person: { name: string; email: string } | null;
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

/** Dedupe + extract valid emails from assignments and (for stories) credited visuals. */
function collectEmails(assignments: AssignedPerson[], visuals: CreditedVisual[] = []): string[] {
  const emails = new Set<string>();
  for (const a of assignments) {
    if (a.person?.email) emails.add(a.person.email);
  }
  for (const v of visuals) {
    if (v.person?.email) emails.add(v.person.email);
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
