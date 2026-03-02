"use client"

import { useRouter } from "next/navigation"
import { VideoForm } from "@/components/story/VideoForm"

export function VideoFormWrapper() {
  const router = useRouter()

  return (
    <VideoForm
      onSuccess={(id) => router.push(`/videos/${id}`)}
    />
  )
}
