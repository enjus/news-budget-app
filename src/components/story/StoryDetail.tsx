"use client"

import { useRef } from "react"
import { toast } from "sonner"
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
import { StoryForm, type StoryFormHandle } from "./StoryForm"
import { AssignmentSection } from "./AssignmentSection"
import { VisualSection } from "./VisualSection"
import { StoryVideoSection } from "./StoryVideoSection"
import { MediaRequestSection } from "@/components/media-requests/MediaRequestSection"
import { differenceInDays } from "date-fns"
import type { StoryWithRelations } from "@/types/index"

interface StoryDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
}

export function StoryDetail({ story, onUpdate }: StoryDetailProps) {
  const formRef = useRef<StoryFormHandle>(null)

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
        ref={formRef}
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

      <StoryVideoSection story={story} onUpdate={onUpdate} />

      <Separator />

      <MediaRequestSection storyId={story.id} />

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
