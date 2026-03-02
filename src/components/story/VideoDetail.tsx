"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Edit2, ChevronDown, ExternalLink, Sparkles, Copy, Check } from "lucide-react"
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
import { VideoForm } from "./VideoForm"
import { VideoAssignmentSection } from "./VideoAssignmentSection"
import { differenceInDays } from "date-fns"
import { STORY_STATUS_LABELS, formatPubDate } from "@/lib/utils"
import type { VideoWithRelations } from "@/types/index"

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SCHEDULED: "secondary",
  PUBLISHED_ITERATING: "secondary",
  PUBLISHED_FINAL: "default",
  SHELVED: "destructive",
}

interface VideoDetailProps {
  video: VideoWithRelations
  onUpdate: () => void
}

export function VideoDetail({ video, onUpdate }: VideoDetailProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pubMenuOpen, setPubMenuOpen] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyUrl(key: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

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
          <h2 className="text-lg font-semibold">Edit Video</h2>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
        <VideoForm
          video={video}
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
            <h1 className="text-2xl font-bold tracking-tight">{video.slug}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[video.status] ?? "outline"}>
              {STORY_STATUS_LABELS[video.status] ?? video.status}
            </Badge>
            {video.isEnterprise && (
              <Badge variant="secondary">Enterprise</Badge>
            )}
            {video.aiContributed && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                <Sparkles className="size-3" />
                AI Contributed
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{video.budgetLine}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            <Edit2 className="size-4" />
            Edit
          </Button>

          {/* Publish menu */}
          {video.status !== "PUBLISHED_FINAL" && video.status !== "SHELVED" && (
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
          {video.status !== "SHELVED" && (
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
      {video.status === "SHELVED" && video.shelvedAt && (() => {
        const daysShelved = differenceInDays(new Date(), new Date(video.shelvedAt))
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
            {formatPubDate(video.onlinePubDate, video.onlinePubDateTBD)}
          </p>
        </div>

        {/* Associated Story */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Associated Story
          </p>
          {video.story ? (
            <Link
              href={`/stories/${video.storyId}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {video.story.slug}
              <ExternalLink className="size-3" />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Standalone</p>
          )}
        </div>

        {video.notes && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{video.notes}</p>
          </div>
        )}

      </div>

      {/* Platform Links */}
      {(["youtubeUrl", "reelsUrl", "tiktokUrl", "otherUrl"] as const).some((k) => video[k]) && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Platform Links
            </h3>
            <div className="space-y-2">
              {(
                [
                  { key: "youtubeUrl", label: "YouTube" },
                  { key: "reelsUrl", label: "Reels" },
                  { key: "tiktokUrl", label: "TikTok" },
                  { key: "otherUrl", label: "Other" },
                ] as const
              )
                .filter(({ key }) => video[key])
                .map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                      {label}
                    </span>
                    <a
                      href={video[key]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {video[key]}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => copyUrl(key, video[key]!)}
                      title="Copy URL"
                    >
                      {copiedKey === key
                        ? <Check className="size-3 text-green-600" />
                        : <Copy className="size-3" />}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Assignments */}
      <VideoAssignmentSection
        videoId={video.id}
        assignments={video.assignments}
        onUpdate={onUpdate}
      />
    </div>
  )
}
