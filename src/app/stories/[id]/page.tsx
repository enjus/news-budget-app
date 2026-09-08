import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canCreateContent } from "@/lib/utils"
import { blockedFromDraft } from "@/lib/api-helpers"
import { commentInclude, commentOrderBy } from "@/lib/comments"
import { StoryDetailWrapper } from "./StoryDetailWrapper"

interface StoryPageProps {
  params: Promise<{ id: string }>
}

export default async function StoryPage({ params }: StoryPageProps) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)])

  const story = await prisma.story.findUnique({
    where: { id },
    include: {
      assignments: { include: { person: true } },
      visuals: { include: { person: true } },
      videos: true,
      tags: true,
      comments: { include: commentInclude, orderBy: commentOrderBy },
      createdByUser: { select: { id: true, name: true } },
    },
  })

  // Off-budget drafts are only visible to their creator, assignees, or admins
  if (!story || blockedFromDraft(story, session?.user)) {
    notFound()
  }

  const readOnly = !session?.user || !canCreateContent(session.user.appRole)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <StoryDetailWrapper initialStory={story} storyId={id} readOnly={readOnly} />
    </div>
  )
}
