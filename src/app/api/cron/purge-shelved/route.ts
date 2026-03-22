import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/** Purge stories and videos shelved more than 90 days ago.
 *  Triggered by Vercel Cron (vercel.json) — runs daily at 3 AM UTC. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [stories, videos] = await Promise.all([
    prisma.story.deleteMany({ where: { status: "SHELVED", shelvedAt: { lte: cutoff } } }),
    prisma.video.deleteMany({ where: { status: "SHELVED", shelvedAt: { lte: cutoff } } }),
  ])

  return NextResponse.json({
    purged: { stories: stories.count, videos: videos.count },
    cutoffDate: cutoff.toISOString(),
  })
}
