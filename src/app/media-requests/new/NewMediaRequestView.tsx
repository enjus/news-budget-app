"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { MediaRequestForm } from "@/components/media-requests/MediaRequestForm"

export function NewMediaRequestView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()

  const storyId = searchParams.get("storyId")
  const personId = session?.user?.personId

  if (!personId) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Your user account is not linked to a person record. Ask an admin to link it.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/media-requests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Media Requests
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">New Media Request</h1>
      <MediaRequestForm
        requestedById={personId}
        storyId={storyId}
        onSuccess={(id) => router.push(`/media-requests/${id}`)}
      />
    </div>
  )
}
