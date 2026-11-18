// Server side of desk routing (slice 3 §14): reads the VisualDeskRouting table
// and sends the desk email. Kept apart from visual-notifications.ts so that
// module's pure builders stay testable without a database client.

import { sendEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"
import {
  deskRecipients,
  visualRequestEmail,
  type DeskRoutingRow,
  type VisualRequestEmailInput,
} from "@/lib/visual-notifications"

/**
 * The saved desk lists (four rows at most). A failed read logs and returns
 * none, so the desk email falls back to the env vars instead of not sending.
 */
export async function loadDeskRouting(): Promise<DeskRoutingRow[]> {
  try {
    return await prisma.visualDeskRouting.findMany({ select: { type: true, emails: true } })
  } catch (error) {
    console.error("Visual desk routing read failed; using VISUAL_REQUEST_EMAILS_* only:", error)
    return []
  }
}

/**
 * Email the desk for a newly filed request. Fire-and-forget from both POST
 * routes: the request is already saved, and nothing here throws past
 * sendEmail() (which logs and returns false). Recipients come from the
 * routing table, then the env (deskRecipients). With nothing configured for the
 * type it logs and skips — the request still stands.
 */
export async function notifyVisualDesk(visual: VisualRequestEmailInput): Promise<void> {
  const recipients = deskRecipients(visual.type, process.env, await loadDeskRouting())
  if (recipients.length === 0) {
    console.warn(`Visual request desk email skipped: no recipients configured for ${visual.type} (visual ${visual.id})`)
    return
  }
  const { subject, text, html } = visualRequestEmail(visual)
  await sendEmail({ to: recipients, subject, text, html })
}
