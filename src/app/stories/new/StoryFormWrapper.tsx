"use client"

import { useRouter } from "next/navigation"
import { StoryForm } from "@/components/story/StoryForm"

export function StoryFormWrapper() {
  const router = useRouter()

  return (
    <StoryForm
      onSuccess={(id) => router.push(`/stories/${id}`)}
    />
  )
}
