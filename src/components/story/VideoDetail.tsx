"use client"

import { useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { VideoForm, type VideoFormHandle } from "./VideoForm"
import { VideoAssignmentSection } from "./VideoAssignmentSection"
import { differenceInDays } from "date-fns"
import type { VideoWithRelations } from "@/types/index"

interface VideoDetailProps {
  video: VideoWithRelations
  onUpdate: () => void
}

export function VideoDetail({ video, onUpdate }: VideoDetailProps) {
  const formRef = useRef<VideoFormHandle>(null)

  async function patchStatus(status: string) {
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success("Status updated")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{video.slug}</h1>
          {video.story && (
            <Link
              href={`/stories/${video.storyId}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Story: {video.story.slug}
              <ExternalLink className="size-3" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => formRef.current?.submitNotify()}
          >
            Save & Notify Team
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => formRef.current?.submitNormal()}
          >
            Save Changes
          </Button>

        {!["SHELVED", "PUBLISHED_ITERATING", "PUBLISHED_FINAL"].includes(video.status) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              >
                Shelve Video
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Shelve this video?</AlertDialogTitle>
                <AlertDialogDescription>
                  The video will be moved to the Shelved section and hidden from active budgets.
                  You can restore it by changing its status.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => patchStatus("SHELVED")}>
                  Shelve
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        </div>
      </div>

      {/* Shelved countdown banner */}
      {video.status === "SHELVED" && video.shelvedAt && (() => {
        const daysShelved = differenceInDays(new Date(), new Date(video.shelvedAt))
        const daysLeft = 90 - daysShelved
        const urgent = daysLeft <= 14
        return (
          <div className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${urgent ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-yellow-500/40 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400"}`}>
            <span className="font-semibold">
              {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} until auto-deletion` : "Scheduled for deletion"}
            </span>
            <span className="text-muted-foreground">
              — shelved {daysShelved} day{daysShelved === 1 ? "" : "s"} ago. Change status to restore.
            </span>
          </div>
        )
      })()}

      <VideoAssignmentSection
        videoId={video.id}
        assignments={video.assignments}
        onUpdate={onUpdate}
      />

      <Separator />

      {/* Form — always editable, remounts when video is saved */}
      <VideoForm
        ref={formRef}
        key={String(video.updatedAt)}
        video={video}
        onSuccess={() => onUpdate()}
      />

      <Separator />

      {/* Bottom action row — mirrors header */}
      <div className="flex justify-end gap-2 pb-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => formRef.current?.submitNotify()}
        >
          Save & Notify Team
        </Button>
        <Button
          type="button"
          onClick={() => formRef.current?.submitNormal()}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}
