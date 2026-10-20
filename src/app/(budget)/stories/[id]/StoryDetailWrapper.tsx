"use client"

import { StoryDetail } from "@/components/story/StoryDetail"
import { PitchDetail } from "@/components/story/PitchDetail"
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

  // A pitch (onBudget: false, pitchedAt set) gets its own lighter detail page
  // instead of StoryDetail with a banner bolted on — see PitchDetail's docblock.
  const isPitch = !current.onBudget && current.pitchedAt !== null

  if (isPitch) {
    return <PitchDetail story={current} onUpdate={() => mutate()} readOnly={readOnly} />
  }

  return <StoryDetail story={current} onUpdate={() => mutate()} readOnly={readOnly} />
}
