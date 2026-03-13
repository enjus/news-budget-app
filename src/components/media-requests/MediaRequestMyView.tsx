"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaRequests } from "@/lib/hooks/useMediaRequests"
import { MediaRequestCard } from "./MediaRequestCard"
import { MEDIA_REQUEST_STATUS_LABELS } from "@/lib/utils"

const STATUS_ORDER = ["REQUESTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELIVERED", "DECLINED", "CANCELED"]

export function MediaRequestMyView() {
  const { data: session } = useSession()
  const personId = session?.user?.personId

  const { mediaRequests, isLoading } = useMediaRequests(
    personId ? { requestedById: personId } : undefined
  )

  if (!personId) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Your user account is not linked to a person record. Ask an admin to link it.
      </div>
    )
  }

  // Group by status
  const grouped: Record<string, typeof mediaRequests> = {}
  for (const mr of mediaRequests) {
    if (!grouped[mr.status]) grouped[mr.status] = []
    grouped[mr.status].push(mr)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My Requests</h1>
        <Button asChild size="sm">
          <Link href="/media-requests/new">
            <Plus className="size-4" />
            New Request
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : mediaRequests.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          You haven&apos;t made any media requests yet.
        </div>
      ) : (
        <div className="space-y-6">
          {STATUS_ORDER.filter((s) => grouped[s]?.length).map((status) => (
            <div key={status} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {MEDIA_REQUEST_STATUS_LABELS[status] ?? status}{" "}
                <span className="font-normal">({grouped[status].length})</span>
              </h2>
              {grouped[status].map((mr) => (
                <MediaRequestCard key={mr.id} request={mr} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
