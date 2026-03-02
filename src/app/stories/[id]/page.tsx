import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { StoryDetailWrapper } from "./StoryDetailWrapper"

interface StoryPageProps {
  params: Promise<{ id: string }>
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { id } = await params

  const story = await prisma.story.findUnique({
    where: { id },
    include: {
      assignments: { include: { person: true } },
      visuals: { include: { person: true } },
      videos: true,
    },
  })

  if (!story) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <StoryDetailWrapper initialStory={story} storyId={id} />
    </div>
  )
}
