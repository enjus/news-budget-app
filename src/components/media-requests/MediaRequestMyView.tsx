"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Plus, Archive, ArchiveX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaRequests } from "@/lib/hooks/useMediaRequests"
import { MediaRequestCard } from "./MediaRequestCard"
import { MEDIA_REQUEST_STATUS_LABELS } from "@/lib/utils"

const ACTIVE_STATUS_ORDER = ["REQUESTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELIVERED"]
const ARCHIVE_STATUS_ORDER = ["COMPLETED", "DELIVERED", "DECLINED", "CANCELED"]

export function MediaRequestMyView() {
  const { data: session } = useSession()
  const personId = session?.user?.personId
  const [showArchive, setShowArchive] = useState(false)

  const { mediaRequests, isLoading } = useMediaRequests(
    personId ? { requestedById: personId, archived: showArchive || undefined } : undefined
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

  const statusOrder = showArchive ? ARCHIVE_STATUS_ORDER : ACTIVE_STATUS_ORDER

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {showArchive ? "My Archived Requests" : "My Requests"}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? (
              <><ArchiveX className="size-4" />Active</>
            ) : (
              <><Archive className="size-4" />Archive</>
            )}
          </Button>
          {!showArchive && (
            <Button asChild size="sm">
              <Link href="/media-requests/new">
                <Plus className="size-4" />
                New Request
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : mediaRequests.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {showArchive ? "No archived requests." : "You haven't made any media requests yet."}
        </div>
      ) : (
        <div className="space-y-6">
          {statusOrder.filter((s) => grouped[s]?.length).map((status) => (
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
