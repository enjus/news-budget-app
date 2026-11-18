// The requester's decline/delivery email (issue #23, slice 3, decision 2):
// loads what the pure builders need and sends. Kept apart from
// visual-notifications.ts so that module stays free of the database client.

import { sendEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"
import {
  REQUESTER_NOTICE_STATUSES,
  requesterNoticeEmail,
  requesterNoticeRecipient,
} from "@/lib/visual-notifications"

/**
 * Tell the requester their request was declined or delivered. Called
 * fire-and-forget from PATCH /api/visuals/[id] after the transition is saved.
 * Re-reads the row (so it reports what was committed) and does nothing unless
 * it's still DECLINED/DELIVERED, the requester can be emailed, and they didn't
 * make the change themselves. Never throws past sendEmail(), which logs.
 */
export async function notifyRequesterOfOutcome(
  visualId: string,
  actor: { personId: string | null; name: string },
): Promise<void> {
  const visual = await prisma.visual.findUnique({
    where: { id: visualId },
    select: {
      id: true,
      type: true,
      status: true,
      description: true,
      declineReason: true,
      links: true,
      dataUrl: true,
      requestedById: true,
      requestedBy: { select: { email: true, isActive: true, isStaff: true } },
      person: { select: { name: true } },
      story: { select: { id: true, slug: true, budgetLine: true } },
    },
  })
  if (!visual || !REQUESTER_NOTICE_STATUSES.includes(visual.status)) return

  const to = requesterNoticeRecipient(visual, actor.personId)
  if (!to) return

  const email = requesterNoticeEmail({ ...visual, actorName: actor.name })
  if (!email) return
  await sendEmail({ to: [to], ...email })
}
