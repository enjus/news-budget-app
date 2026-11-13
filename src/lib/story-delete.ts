import type { Prisma, PrismaClient } from "@prisma/client"
import { partitionVisualsForStoryDelete } from "./visual-requests"

/**
 * Settle the visuals of stories that are about to be deleted. Visual.storyId is
 * SetNull (no cascade), so every story-delete path must call this first, inside
 * the same transaction: in-progress and delivered work survives as an unplaced
 * visual (`storyId = null`), everything else goes with the story.
 */
export async function settleVisualsForStoryDelete(tx: Prisma.TransactionClient, storyIds: string[]): Promise<void> {
  if (storyIds.length === 0) return
  const visuals = await tx.visual.findMany({ where: { storyId: { in: storyIds } }, select: { id: true, status: true } })
  const { deleteIds, unplaceIds } = partitionVisualsForStoryDelete(visuals)
  await tx.visual.deleteMany({ where: { id: { in: deleteIds } } })
  await tx.visual.updateMany({ where: { id: { in: unplaceIds } }, data: { storyId: null } })
}

/** Stories per transaction in deleteStoriesWithVisuals. */
export const STORY_DELETE_BATCH_SIZE = 25
// Prisma's interactive transactions default to a 5s timeout; a batch is a few
// queries plus the cascade (comments, assignments, tags), so give it headroom.
const BATCH_TX_TIMEOUT_MS = 20_000

/**
 * Delete every story matching `where`, settling its visuals first. Works through
 * the matches in small batches, each in its own transaction, so a big backlog (the
 * 90-day purge after a long outage, say) can't blow Prisma's transaction timeout —
 * and one bad batch rolls back alone instead of undoing the whole run. Returns the
 * number of stories deleted.
 */
export async function deleteStoriesWithVisuals(
  db: PrismaClient,
  where: Prisma.StoryWhereInput,
  batchSize = STORY_DELETE_BATCH_SIZE,
): Promise<number> {
  let deleted = 0
  for (;;) {
    const batch = await db.story.findMany({ where, select: { id: true }, take: batchSize })
    if (batch.length === 0) return deleted
    const ids = batch.map((s) => s.id)
    await db.$transaction(
      async (tx) => {
        await settleVisualsForStoryDelete(tx, ids)
        await tx.story.deleteMany({ where: { id: { in: ids } } })
      },
      { timeout: BATCH_TX_TIMEOUT_MS },
    )
    deleted += ids.length
  }
}
