import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canCreateContent } from "@/lib/utils"
import { VideoDetailWrapper } from "./VideoDetailWrapper"

interface VideoPageProps {
  params: Promise<{ id: string }>
}

export default async function VideoPage({ params }: VideoPageProps) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)])

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

  const readOnly = !session?.user || !canCreateContent(session.user.appRole)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <VideoDetailWrapper initialVideo={video} videoId={id} readOnly={readOnly} />
    </div>
  )
}
