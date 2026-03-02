"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Edit2, ChevronDown, Sparkles, Plus, Video, ExternalLink, Copy, Check } from "lucide-react"
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
import Link from "next/link"
import { differenceInDays } from "date-fns"
import {
  STORY_STATUS_LABELS,
  formatPubDate,
  formatPrintDate,
} from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SCHEDULED: "secondary",
  PUBLISHED_ITERATING: "secondary",
  PUBLISHED_FINAL: "default",
  SHELVED: "destructive",
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      onClick={() => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      title="Copy URL"
    >
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
    </Button>
  )
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
            {story.aiContributed && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                <Sparkles className="size-3" />
                AI Contributed
              </span>
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
                    onClick={() => { patchStatus("SCHEDULED"); setPubMenuOpen(false) }}
                  >
                    {STORY_STATUS_LABELS["SCHEDULED"]}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => { patchStatus("PUBLISHED_ITERATING"); setPubMenuOpen(false) }}
                  >
                    {STORY_STATUS_LABELS["PUBLISHED_ITERATING"]}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => { patchStatus("PUBLISHED_FINAL"); setPubMenuOpen(false) }}
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
            <span className="text-muted-foreground">— shelved {daysShelved} day{daysShelved === 1 ? "" : "s"} ago. Unarchive to reset the clock.</span>
          </div>
        )
      })()}

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
            Daily Edition Pub Date
          </p>
          <p className="text-sm">
            {formatPrintDate(story.printPubDate, story.printPubDateTBD)}
          </p>
        </div>

        {(story as any).wordCount != null && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Word Count
            </p>
            <p className={`text-sm font-medium ${(story as any).wordCount > 1400 ? "text-destructive" : ""}`}>
              {((story as any).wordCount as number).toLocaleString()}
            </p>
          </div>
        )}

        {story.postUrl && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Post URL
            </p>
            <div className="flex items-center gap-2">
              <a
                href={story.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                {story.postUrl}
                <ExternalLink className="size-3 shrink-0" />
              </a>
              <CopyUrlButton url={story.postUrl} />
            </div>
          </div>
        )}

        {story.notes && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{story.notes}</p>
          </div>
        )}

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
