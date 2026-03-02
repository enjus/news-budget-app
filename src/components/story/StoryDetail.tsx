"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Edit2, ChevronDown } from "lucide-react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { StoryForm } from "./StoryForm"
import { AssignmentSection } from "./AssignmentSection"
import { VisualSection } from "./VisualSection"
import {
  STORY_STATUS_LABELS,
  formatPubDate,
  formatPrintDate,
} from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  PUBLISHED_ITERATING: "secondary",
  PUBLISHED_FINAL: "default",
  SHELVED: "destructive",
}

interface StoryDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
}

export function StoryDetail({ story, onUpdate }: StoryDetailProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pubMenuOpen, setPubMenuOpen] = useState(false)

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
      toast.success(`Status updated to ${STORY_STATUS_LABELS[status]}`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    }
  }

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Story</h2>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
        <StoryForm
          story={story}
          onSuccess={() => {
            setIsEditing(false)
            onUpdate()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{story.slug}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[story.status] ?? "outline"}>
              {STORY_STATUS_LABELS[story.status] ?? story.status}
            </Badge>
            {story.isEnterprise && (
              <Badge variant="secondary">Enterprise</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{story.budgetLine}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            <Edit2 className="size-4" />
            Edit
          </Button>

          {/* Publish menu */}
          {story.status !== "PUBLISHED_FINAL" && story.status !== "SHELVED" && (
            <Popover open={pubMenuOpen} onOpenChange={setPubMenuOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  Mark as Published
                  <ChevronDown className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1" align="end">
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      patchStatus("PUBLISHED_ITERATING")
                      setPubMenuOpen(false)
                    }}
                  >
                    {STORY_STATUS_LABELS["PUBLISHED_ITERATING"]}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      patchStatus("PUBLISHED_FINAL")
                      setPubMenuOpen(false)
                    }}
                  >
                    {STORY_STATUS_LABELS["PUBLISHED_FINAL"]}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Shelve */}
          {story.status !== "SHELVED" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
                  Shelve Story
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Shelve this story?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The story will be moved to the Shelved section and hidden from active budgets.
                    You can restore it by editing its status.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => patchStatus("SHELVED")}
                  >
                    Shelve
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Online Pub Date
          </p>
          <p className="text-sm">
            {formatPubDate(story.onlinePubDate, story.onlinePubDateTBD)}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Print Pub Date
          </p>
          <p className="text-sm">
            {formatPrintDate(story.printPubDate, story.printPubDateTBD)}
          </p>
        </div>

        {story.notes && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{story.notes}</p>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notify Team
          </p>
          <p className="text-sm">{story.notifyTeam ? "Yes" : "No"}</p>
        </div>
      </div>

      <Separator />

      {/* Assignments */}
      <AssignmentSection
        storyId={story.id}
        assignments={story.assignments}
        onUpdate={onUpdate}
      />

      <Separator />

      {/* Visuals */}
      <VisualSection
        storyId={story.id}
        visuals={story.visuals}
        onUpdate={onUpdate}
      />
    </div>
  )
}
