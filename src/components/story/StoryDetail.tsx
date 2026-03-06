"use client"

import { toast } from "sonner"
import { Plus, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { StoryForm } from "./StoryForm"
import { AssignmentSection } from "./AssignmentSection"
import { VisualSection } from "./VisualSection"
import Link from "next/link"
import { differenceInDays } from "date-fns"
import { STORY_STATUS_LABELS } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

interface StoryDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
}

export function StoryDetail({ story, onUpdate }: StoryDetailProps) {
  async function patchStatus(status: string) {
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{story.slug}</h1>

        <div className="flex items-center gap-2">
          <Button type="submit" form="story-form" size="sm">
            Save Changes
          </Button>

        {!["SHELVED", "PUBLISHED_ITERATING", "PUBLISHED_FINAL"].includes(story.status) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              >
                Shelve Story
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Shelve this story?</AlertDialogTitle>
                <AlertDialogDescription>
                  The story will be moved to the Shelved section and hidden from active budgets.
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
      {story.status === "SHELVED" && story.shelvedAt && (() => {
        const daysShelved = differenceInDays(new Date(), new Date(story.shelvedAt))
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

      {/* Form — always editable, remounts when story is saved */}
      <StoryForm
        key={String(story.updatedAt)}
        story={story}
        onSuccess={() => onUpdate()}
      />

      <Separator />

      <AssignmentSection
        storyId={story.id}
        assignments={story.assignments}
        onUpdate={onUpdate}
      />

      <Separator />

      <VisualSection
        storyId={story.id}
        visuals={story.visuals}
        onUpdate={onUpdate}
      />

      <Separator />

      {/* Associated Videos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Videos
          </h3>
          <Link
            href={`/videos/new?storyId=${story.id}`}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3" />
            Add Video
          </Link>
        </div>

        {story.videos.length > 0 ? (
          <div className="space-y-2">
            {story.videos.map((video) => (
              <Link
                key={video.id}
                href={`/videos/${video.id}`}
                className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
              >
                <Video className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{video.slug}</span>
                {video.budgetLine && (
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {video.budgetLine}
                  </span>
                )}
                {video.status !== "DRAFT" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                    {STORY_STATUS_LABELS[video.status] ?? video.status}
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No videos linked to this story.</p>
        )}
      </div>
    </div>
  )
}
