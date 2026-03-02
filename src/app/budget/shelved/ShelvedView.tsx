"use client"

import { useState } from "react"
import Link from "next/link"
import { ArchiveRestore } from "lucide-react"
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
import { STORY_STATUS_LABELS } from "@/lib/utils"
import { toast } from "sonner"

export function ShelvedView() {
  const { stories, isLoading: storiesLoading, mutate: mutateStories } = useStories({ status: "SHELVED" })
  const { videos, isLoading: videosLoading, mutate: mutateVideos } = useVideos({ status: "SHELVED" })
  const [unarchiving, setUnarchiving] = useState<string | null>(null)
  const isLoading = storiesLoading || videosLoading

  async function unarchive(type: "story" | "video", id: string) {
    setUnarchiving(id)
    try {
      const res = await fetch(`/api/${type === "story" ? "stories" : "videos"}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      })
      if (!res.ok) throw new Error("Failed to unarchive")
      toast.success(`${type === "story" ? "Story" : "Video"} returned to Draft`)
      mutateStories()
      mutateVideos()
    } catch {
      toast.error("Failed to unarchive. Please try again.")
    } finally {
      setUnarchiving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Shelved Content</h2>
        <p className="text-sm text-muted-foreground">
          Stories and videos on hold. Unarchive to return them to Draft status.
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
                    className="flex items-center justify-between rounded-lg border bg-card p-4"
                  >
                    <Link
                      href={`/stories/${story.id}`}
                      className="flex-1 space-y-0.5 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{story.slug}</span>
                        <Badge variant="destructive" className="text-xs">
                          {STORY_STATUS_LABELS["SHELVED"]}
                        </Badge>
                        {story.isEnterprise && (
                          <Badge variant="secondary" className="text-xs">Enterprise</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{story.budgetLine}</p>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-4 shrink-0"
                          disabled={unarchiving === story.id}
                        >
                          <ArchiveRestore className="size-4" />
                          Unarchive
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Unarchive story?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{story.slug}&rdquo; will be returned to Draft status and appear
                            in the Daily Budget view.
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
                    className="flex items-center justify-between rounded-lg border bg-card p-4"
                  >
                    <Link
                      href={`/videos/${video.id}`}
                      className="flex-1 space-y-0.5 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{video.slug}</span>
                        <Badge variant="destructive" className="text-xs">
                          {STORY_STATUS_LABELS["SHELVED"]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">Video</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{video.budgetLine}</p>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-4 shrink-0"
                          disabled={unarchiving === video.id}
                        >
                          <ArchiveRestore className="size-4" />
                          Unarchive
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Unarchive video?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{video.slug}&rdquo; will be returned to Draft status and appear
                            in the Daily Budget view.
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
