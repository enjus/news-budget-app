"use client"

import useSWR from "swr"
import { VideoDetail } from "@/components/story/VideoDetail"
import { Skeleton } from "@/components/ui/skeleton"
import type { VideoWithRelations } from "@/types/index"

interface VideoDetailWrapperProps {
  initialVideo: VideoWithRelations
  videoId: string
  readOnly?: boolean
}

export function VideoDetailWrapper({ initialVideo, videoId, readOnly }: VideoDetailWrapperProps) {
  const { data: video, mutate } = useSWR<VideoWithRelations>(`/api/videos/${videoId}`)

  const current = video ?? initialVideo

  if (!current) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  return <VideoDetail video={current} onUpdate={() => mutate()} readOnly={readOnly} />
}
