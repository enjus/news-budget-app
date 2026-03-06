"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Video, ChevronsUpDown, Unlink } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { STORY_STATUS_LABELS } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

interface VideoPickerItem {
  id: string
  slug: string
  budgetLine: string
}

interface StoryVideoSectionProps {
  story: StoryWithRelations
  onUpdate: () => void
}

export function StoryVideoSection({ story, onUpdate }: StoryVideoSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<VideoPickerItem[]>([])
  const [searching, setSearching] = useState(false)
  const [associating, setAssociating] = useState(false)

  const existingVideoIds = new Set(story.videos.map((v) => v.id))

  async function fetchVideos(q: string) {
    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.results as any[]).filter((r) => r.type === "video" && !existingVideoIds.has(r.id))
      )
    } catch { /* fail silently */ } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    setQuery("")
    fetchVideos("")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen])

  useEffect(() => {
    if (!pickerOpen || query === "") return
    const timer = setTimeout(() => fetchVideos(query), 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pickerOpen])

  async function disassociate(videoId: string) {
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: null }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to remove video (${res.status})`)
      }
      toast.success("Video unlinked")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink video")
    }
  }

  async function associate(videoId: string) {
    setAssociating(true)
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to associate video (${res.status})`)
      }
      toast.success("Video associated")
      setPickerOpen(false)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to associate video")
    } finally {
      setAssociating(false)
    }
  }

  const addVideoHref = `/videos/new?storyId=${story.id}&storySlug=${encodeURIComponent(story.slug)}&slug=${encodeURIComponent(story.slug)}&budgetLine=${encodeURIComponent(story.budgetLine)}`

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Videos
      </h3>

      {story.videos.length > 0 ? (
        <div className="space-y-2">
          {story.videos.map((video) => (
            <div
              key={video.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
            >
              <Link
                href={`/videos/${video.id}`}
                className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-80 transition-opacity"
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
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => disassociate(video.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Unlink video"
              >
                <Unlink className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No videos linked to this story.</p>
      )}

      {/* Add / Associate controls — matches VisualSection dashed border style */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
        <Button type="button" size="sm" asChild>
          <Link href={addVideoHref}>
            <Plus className="size-4" />
            Add Video
          </Link>
        </Button>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              disabled={associating}
            >
              Associate Existing
              <ChevronsUpDown className="ml-1.5 size-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search videos..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {searching ? (
                  <CommandEmpty>Loading…</CommandEmpty>
                ) : results.length === 0 ? (
                  <CommandEmpty>
                    {query ? "No videos found." : "No other videos to associate."}
                  </CommandEmpty>
                ) : (
                  <CommandGroup heading={query ? "Search Results" : "Recent Videos"}>
                    {results.map((video) => (
                      <CommandItem
                        key={video.id}
                        value={video.id}
                        onSelect={() => associate(video.id)}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{video.slug}</span>
                          {video.budgetLine && (
                            <span className="text-xs text-muted-foreground">
                              {video.budgetLine.slice(0, 60)}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
