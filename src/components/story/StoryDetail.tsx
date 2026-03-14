"use client"

import { useRef } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
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
import { StoryForm, type StoryFormHandle } from "./StoryForm"
import { AssignmentSection } from "./AssignmentSection"
import { VisualSection } from "./VisualSection"
import { StoryVideoSection } from "./StoryVideoSection"
import { differenceInDays } from "date-fns"
import { STORY_STATUS_LABELS, formatPubDate } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

interface StoryDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
  readOnly?: boolean
}

export function StoryDetail({ story, onUpdate, readOnly }: StoryDetailProps) {
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

  if (readOnly) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{story.slug}</h1>
            {story.isEnterprise && (
              <Badge variant="secondary" className="mt-1">Enterprise</Badge>
            )}
          </div>
          <Badge variant="outline">{STORY_STATUS_LABELS[story.status] ?? story.status}</Badge>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Budget Line</p>
            <p className="text-sm">{story.budgetLine}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Online Pub Date</p>
              <p className="text-sm">{formatPubDate(story.onlinePubDate, story.onlinePubDateTBD)}</p>
            </div>
            {story.wordCount != null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Word Count</p>
                <p className="text-sm">{story.wordCount}</p>
              </div>
            )}
          </div>
          {story.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{story.notes}</p>
            </div>
          )}
          {story.postUrl && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Published URL</p>
              <Link
                href={story.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
              >
                {story.postUrl}
                <ExternalLink className="size-3 shrink-0" />
              </Link>
            </div>
          )}
        </div>

        <Separator />

        <AssignmentSection
          storyId={story.id}
          assignments={story.assignments}
          onUpdate={onUpdate}
          readOnly
        />

        <Separator />

        <VisualSection
          storyId={story.id}
          visuals={story.visuals}
          onUpdate={onUpdate}
          readOnly
        />

        <Separator />

        <StoryVideoSection story={story} onUpdate={onUpdate} />

      </div>
    )
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
