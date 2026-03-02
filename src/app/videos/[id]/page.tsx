import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VideoDetailWrapper } from "./VideoDetailWrapper"

interface VideoPageProps {
  params: Promise<{ id: string }>
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { id } = await params

  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      assignments: { include: { person: true } },
      story: { select: { id: true, slug: true, budgetLine: true } },
    },
  })

  if (!video) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <VideoDetailWrapper initialVideo={video} videoId={id} />
    </div>
  )
}
