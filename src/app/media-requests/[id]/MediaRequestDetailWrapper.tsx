"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { MediaRequestDetail } from "@/components/media-requests/MediaRequestDetail"
import { useMediaRequest } from "@/lib/hooks/useMediaRequest"

interface MediaRequestDetailWrapperProps {
  id: string
}

export function MediaRequestDetailWrapper({ id }: MediaRequestDetailWrapperProps) {
  const { mediaRequest, isLoading, error, mutate } = useMediaRequest(id)

  if (error) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Failed to load media request.
      </div>
    )
  }

  if (isLoading || !mediaRequest) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
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
      <MediaRequestDetail mediaRequest={mediaRequest} onUpdate={() => mutate()} />
    </div>
  )
}
