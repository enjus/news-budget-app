"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { StoryForm } from "@/components/story/StoryForm"

export function StoryFormWrapper() {
  const router = useRouter()
  const params = useSearchParams()

  const onlinePubDate = params.get("onlinePubDate")
  const onlinePubDateTBD = params.get("onlinePubDateTBD") !== "false"
  const isEnterprise = params.get("isEnterprise") === "true"
  const printPubDate = params.get("printPubDate")
  const printPubDateTBD = params.get("printPubDateTBD") !== "false"

  return (
    <StoryForm
      initialValues={{ onlinePubDate, onlinePubDateTBD, isEnterprise, printPubDate, printPubDateTBD }}
      onSuccess={(id) => router.push(`/stories/${id}`)}
    />
  )
}
