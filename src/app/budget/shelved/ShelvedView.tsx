"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArchiveRestore, Trash2 } from "lucide-react"
import { differenceInDays } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
import { useStories } from "@/lib/hooks/useStories"
import { useVideos } from "@/lib/hooks/useVideos"
import { STORY_STATUS_LABELS, todayString } from "@/lib/utils"
import { toast } from "sonner"

function DaysLeftBadge({ shelvedAt }: { shelvedAt: string | Date | null }) {
  if (!shelvedAt) return null
  const daysShelved = differenceInDays(new Date(), new Date(shelvedAt))
  const daysLeft = Math.max(0, 90 - daysShelved)
  const urgent = daysLeft <= 14
  return (
    <span className={`text-xs font-medium ${urgent ? "text-destructive" : "text-muted-foreground"}`}>
      {daysLeft === 0 ? "Deletes soon" : `${daysLeft}d left`}
    </span>
  )
}

export function ShelvedView() {
  const { stories, isLoading: storiesLoading, mutate: mutateStories } = useStories({ status: "SHELVED" })
  const { videos, isLoading: videosLoading, mutate: mutateVideos } = useVideos({ status: "SHELVED" })
  const [working, setWorking] = useState<string | null>(null)
  const isLoading = storiesLoading || videosLoading
  const router = useRouter()

  async function unarchive(type: "story" | "video", id: string) {
    setWorking(id)
    try {
      const endpoint = `/api/${type === "story" ? "stories" : "videos"}/${id}`
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      })
      if (!res.ok) throw new Error("Failed to unarchive")
      const saved = await res.json()
      const budgetDate = saved.onlinePubDateTBD || !saved.onlinePubDate
        ? todayString()
        : new Date(saved.onlinePubDate).toISOString().slice(0, 10)
      toast.success(`${type === "story" ? "Story" : "Video"} returned to "In the works"`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            await fetch(endpoint, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "SHELVED" }),
            })
            mutateStories()
            mutateVideos()
          },
        },
        cancel: {
          label: "See on budget",
          onClick: () => router.push(`/budget/daily/${budgetDate}`),
        },
      })
      mutateStories()
      mutateVideos()
    } catch {
      toast.error("Failed to unarchive. Please try again.")
    } finally {
      setWorking(null)
    }
  }

  async function deleteItem(type: "story" | "video", id: string) {
    setWorking(id)
    try {
      const res = await fetch(`/api/${type === "story" ? "stories" : "videos"}/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success(`${type === "story" ? "Story" : "Video"} permanently deleted`)
      mutateStories()
      mutateVideos()
    } catch {
      toast.error("Failed to delete. Please try again.")
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Shelved Content</h2>
        <p className="text-sm text-muted-foreground">
          Shelved items are automatically deleted after 90 days. Unarchive to reset the clock.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Stories */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Shelved Stories ({stories.length})
            </h3>
            {stories.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">No shelved stories.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stories.map((story) => (
                  <div
                    key={story.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4"
                  >
                    <Link
                      href={`/stories/${story.id}`}
                      className="flex-1 space-y-0.5 hover:opacity-80 transition-opacity min-w-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{story.slug}</span>
                        <Badge variant="destructive" className="text-xs">
                          {STORY_STATUS_LABELS["SHELVED"]}
                        </Badge>
                        {story.isEnterprise && (
                          <Badge variant="secondary" className="text-xs">Enterprise</Badge>
                        )}
                        <DaysLeftBadge shelvedAt={story.shelvedAt} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{story.budgetLine}</p>
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Unarchive */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={working === story.id}>
                            <ArchiveRestore className="size-4" />
                            Unarchive
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unarchive story?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{story.slug}&rdquo; will be returned to "In the works" status.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unarchive("story", story.id)}>
                              Unarchive
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* Delete */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={working === story.id}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently delete story?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{story.slug}&rdquo; will be permanently deleted. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => deleteItem("story", story.id)}
                            >
                              Delete permanently
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Videos */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Shelved Videos ({videos.length})
            </h3>
            {videos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">No shelved videos.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4"
                  >
                    <Link
                      href={`/videos/${video.id}`}
                      className="flex-1 space-y-0.5 hover:opacity-80 transition-opacity min-w-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{video.slug}</span>
                        <Badge variant="destructive" className="text-xs">
                          {STORY_STATUS_LABELS["SHELVED"]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">Video</Badge>
                        <DaysLeftBadge shelvedAt={video.shelvedAt} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{video.budgetLine}</p>
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={working === video.id}>
                            <ArchiveRestore className="size-4" />
                            Unarchive
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unarchive video?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{video.slug}&rdquo; will be returned to "In the works" status.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unarchive("video", video.id)}>
                              Unarchive
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={working === video.id}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently delete video?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{video.slug}&rdquo; will be permanently deleted. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => deleteItem("video", video.id)}
                            >
                              Delete permanently
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
