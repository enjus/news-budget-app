"use client"

import { StoryDetail } from "@/components/story/StoryDetail"
import { useStory } from "@/lib/hooks/useStory"
import { Skeleton } from "@/components/ui/skeleton"
import type { StoryWithRelations } from "@/types/index"

interface StoryDetailWrapperProps {
  initialStory: StoryWithRelations
  storyId: string
  readOnly?: boolean
}

export function StoryDetailWrapper({ initialStory, storyId, readOnly }: StoryDetailWrapperProps) {
  const { story, mutate } = useStory(storyId)

  const current = story ?? initialStory

  if (!current) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  return <StoryDetail story={current} onUpdate={() => mutate()} readOnly={readOnly} />
}
