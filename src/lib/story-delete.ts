import type { Prisma, PrismaClient } from "@prisma/client"
import { partitionVisualsForStoryDelete } from "./visual-requests"
import { STORY_DELETE_NOTICE_STATUSES, type DeletedStoryNotice } from "./visual-notifications"

/**
 * Settle the visuals of stories that are about to be deleted. Visual.storyId is
 * SetNull (no cascade), so every story-delete path must call this first, inside
 * the same transaction: in-progress and delivered work survives as an unplaced
 * visual (`storyId = null`), everything else goes with the story.
 *
 * Returns the assignee notices (ASSIGNED / IN_PROGRESS rows with their person
 * and story) read *before* anything was deleted. Send them only after the
 * transaction commits — if it rolls back, the story still exists and no email
 * should say otherwise.
 */
export async function settleVisualsForStoryDelete(
  tx: Prisma.TransactionClient,
  storyIds: string[],
): Promise<DeletedStoryNotice[]> {
  if (storyIds.length === 0) return []
  const visuals = await tx.visual.findMany({
    where: { storyId: { in: storyIds } },
    select: {
      id: true,
      type: true,
      status: true,
      person: { select: { name: true, email: true, isActive: true, isStaff: true } },
      story: { select: { id: true, slug: true, budgetLine: true } },
    },
  })
  const notices: DeletedStoryNotice[] = []
  for (const v of visuals) {
    if (v.story && STORY_DELETE_NOTICE_STATUSES.includes(v.status)) {
      notices.push({ id: v.id, type: v.type, status: v.status, person: v.person, story: v.story })
    }
  }
  const { deleteIds, unplaceIds } = partitionVisualsForStoryDelete(visuals)
  await tx.visual.deleteMany({ where: { id: { in: deleteIds } } })
  await tx.visual.updateMany({ where: { id: { in: unplaceIds } }, data: { storyId: null } })
  return notices
}

/** Stories per transaction in deleteStoriesWithVisuals. */
export const STORY_DELETE_BATCH_SIZE = 25
// Prisma's interactive transactions default to a 5s timeout; a batch is a few
// queries plus the cascade (comments, assignments, tags), so give it headroom.
const BATCH_TX_TIMEOUT_MS = 20_000

export interface DeleteStoriesOptions {
  batchSize?: number
  /**
   * Caller-owned accumulator for assignee notices. Each batch's notices are
   * appended as soon as that batch commits, so if a later batch throws, the
   * caller still holds the notices for the stories that really were deleted
   * and can send them before reporting the failure.
   */
  notices?: DeletedStoryNotice[]
}

/**
 * Delete every story matching `where`, settling its visuals first. Works through
 * the matches in small batches, each in its own transaction, so a big backlog (the
 * 90-day purge after a long outage, say) can't blow Prisma's transaction timeout —
 * and one bad batch rolls back alone instead of undoing the whole run. A batch
 * that throws ends the run (the rejection propagates); it is never retried here.
 * Returns the number of stories deleted.
 */
export async function deleteStoriesWithVisuals(
  db: PrismaClient,
  where: Prisma.StoryWhereInput,
  { batchSize = STORY_DELETE_BATCH_SIZE, notices }: DeleteStoriesOptions = {},
): Promise<number> {
  let deleted = 0
  for (;;) {
    const batch = await db.story.findMany({ where, select: { id: true }, take: batchSize })
    if (batch.length === 0) return deleted
    const ids = batch.map((s) => s.id)
    const batchNotices = await db.$transaction(
      async (tx) => {
        const n = await settleVisualsForStoryDelete(tx, ids)
        await tx.story.deleteMany({ where: { id: { in: ids } } })
        return n
      },
      { timeout: BATCH_TX_TIMEOUT_MS },
    )
    notices?.push(...batchNotices)
    deleted += ids.length
  }
}
