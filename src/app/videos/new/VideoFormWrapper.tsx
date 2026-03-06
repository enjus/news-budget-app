"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { VideoForm } from "@/components/story/VideoForm"

export function VideoFormWrapper() {
  const router = useRouter()
  const params = useSearchParams()

  const onlinePubDate = params.get("onlinePubDate")
  const onlinePubDateTBD = params.get("onlinePubDateTBD") !== "false"
  const storyId = params.get("storyId")
  const slug = params.get("slug")
  const budgetLine = params.get("budgetLine")
  const storySlug = params.get("storySlug")

  return (
    <VideoForm
      initialValues={{ onlinePubDate, onlinePubDateTBD, storyId, slug, budgetLine, storySlug }}
      onSuccess={(id) => router.push(`/videos/${id}`)}
    />
  )
}
