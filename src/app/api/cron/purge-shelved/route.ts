import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/** Shelve pitches past their expiresAt, then purge stories/videos shelved more
 *  than 90 days ago. Triggered by Vercel Cron (vercel.json) — runs daily at
 *  3 AM UTC. Shelving (not deleting) an expired pitch keeps it recoverable via
 *  the existing unarchive flow; the 90-day purge below collects it eventually
 *  if nobody does. pitchedAt is deliberately not cleared, so an unarchived
 *  item returns to the pool rather than becoming an ownerless private draft
 *  (see the unshelve-while-still-expired handling in stories/[id]/route.ts).
 *  A pitch with an active claim (assignments.length > 0) is excluded — someone
 *  is actively working it, so it shouldn't vanish into Shelved mid-workflow;
 *  send-to-budget clears pitchedAt/expiresAt when the claim is finally sent,
 *  so a claimed pitch never lingers here past that.
 *  (issue #24 §7) */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const shelvedExpiredPitches = await prisma.story.updateMany({
    where: {
      onBudget: false,
      pitchedAt: { not: null },
      expiresAt: { lte: now },
      status: { not: "SHELVED" },
      assignments: { none: {} },
    },
    data: { status: "SHELVED", shelvedAt: now },
  })

  const [stories, videos] = await Promise.all([
    prisma.story.deleteMany({ where: { status: "SHELVED", shelvedAt: { lte: cutoff } } }),
    prisma.video.deleteMany({ where: { status: "SHELVED", shelvedAt: { lte: cutoff } } }),
  ])

  return NextResponse.json({
    shelvedExpiredPitches: shelvedExpiredPitches.count,
    purged: { stories: stories.count, videos: videos.count },
    cutoffDate: cutoff.toISOString(),
  })
}
