"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useStoryMediaRequests } from "@/lib/hooks/useStoryMediaRequests"
import { MediaRequestCard } from "./MediaRequestCard"
import { MediaRequestForm } from "./MediaRequestForm"

interface MediaRequestSectionProps {
  storyId: string
}

export function MediaRequestSection({ storyId }: MediaRequestSectionProps) {
  const { mediaRequests, isLoading, mutate } = useStoryMediaRequests(storyId)
  const { data: session } = useSession()
  const [showForm, setShowForm] = useState(false)

  const personId = session?.user?.personId

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Media Requests
        </h3>
        {personId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="size-3" />
            {showForm ? "Cancel" : "New Request"}
          </Button>
        )}
      </div>

      {showForm && personId && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <MediaRequestForm
            requestedById={personId}
            storyId={storyId}
            compact
            onSuccess={() => {
              setShowForm(false)
              mutate()
            }}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : mediaRequests.length > 0 ? (
        <div className="space-y-2">
          {mediaRequests.map((mr) => (
            <MediaRequestCard key={mr.id} request={mr} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No media requests yet.</p>
      )}
    </div>
  )
}
