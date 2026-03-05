"use client"

import { useState, useRef, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  createVideoSchema,
  type CreateVideoInput,
} from "@/lib/validations"
import { STORY_STATUS_LABELS, cn } from "@/lib/utils"
import { DateTimePicker } from "@/components/ui/date-time-picker"
interface StoryPickerItem { id: string; slug: string; budgetLine: string }
import type { VideoWithRelations } from "@/types/index"

const STATUS_OPTIONS = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED_FINAL",
  "SHELVED",
] as const


interface VideoFormInitialValues {
  onlinePubDate?: string | null
  onlinePubDateTBD?: boolean
  storyId?: string | null
}

interface VideoFormProps {
  video?: VideoWithRelations
  initialValues?: VideoFormInitialValues
  onSuccess?: (id: string) => void
}

export function VideoForm({ video, initialValues, onSuccess }: VideoFormProps) {
  const isEdit = !!video
  const [storyPickerOpen, setStoryPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [storyResults, setStoryResults] = useState<StoryPickerItem[]>([])
  const [searching, setSearching] = useState(false)

  async function fetchStories(q: string) {
    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setStoryResults(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.results as any[]).filter((r) => r.type === "story")
      )
    } catch { /* fail silently */ } finally {
      setSearching(false)
    }
  }

  // Fetch recent stories when picker opens; reset query
  useEffect(() => {
    if (!storyPickerOpen) return
    setQuery("")
    fetchStories("")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyPickerOpen])

  // Debounced search while picker is open and query is non-empty
  useEffect(() => {
    if (!storyPickerOpen || query === "") return
    const timer = setTimeout(() => fetchStories(query), 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, storyPickerOpen])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateVideoInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createVideoSchema) as any,
    defaultValues: video
      ? {
          slug: video.slug,
          budgetLine: video.budgetLine,
          isEnterprise: video.isEnterprise,
          status: video.status as CreateVideoInput["status"],
          storyId: video.storyId ?? null,
          onlinePubDate: video.onlinePubDate
            ? new Date(video.onlinePubDate).toISOString()
            : null,
          onlinePubDateTBD: video.onlinePubDateTBD,
          notes: video.notes ?? "",
          notifyTeam: video.notifyTeam,
          aiContributed: video.aiContributed,
          youtubeUrl: video.youtubeUrl ?? "",
          reelsUrl: video.reelsUrl ?? "",
          tiktokUrl: video.tiktokUrl ?? "",
          otherUrl: video.otherUrl ?? "",
        }
      : {
          slug: "",
          budgetLine: "",
          isEnterprise: false,
          status: "DRAFT",
          storyId: initialValues?.storyId ?? null,
          onlinePubDate: initialValues?.onlinePubDate ?? null,
          onlinePubDateTBD: initialValues?.onlinePubDateTBD ?? true,
          notes: "",
          notifyTeam: false,
          aiContributed: false,
          youtubeUrl: "",
          reelsUrl: "",
          tiktokUrl: "",
          otherUrl: "",
        },
  })

  const { onBlur: slugOnBlur, ...slugRegister } = register("slug")

  const onlinePubDateTBD = watch("onlinePubDateTBD")
  const storyId = watch("storyId")

  // For the trigger label: check live results first, then fall back to
  // video.story (edit mode) in case the linked story is outside the search window
  const selectedInResults = storyResults.find((r) => r.id === storyId)
  const selectedStoryLabel = selectedInResults
    ? `${selectedInResults.slug} — ${selectedInResults.budgetLine.slice(0, 50)}`
    : storyId && video?.story
      ? `${video.story.slug} — ${video.story.budgetLine.slice(0, 50)}`
      : null

  const notifyRef = useRef(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    const notify = notifyRef.current
    notifyRef.current = false
    try {
      const payload: Record<string, unknown> = {
        ...data,
        notifyTeam: notify,
        onlinePubDate: data.onlinePubDateTBD
          ? null
          : data.onlinePubDate
            ? new Date(data.onlinePubDate).toISOString()
            : null,
        youtubeUrl: data.youtubeUrl?.trim() || null,
        reelsUrl: data.reelsUrl?.trim() || null,
        tiktokUrl: data.tiktokUrl?.trim() || null,
        otherUrl: data.otherUrl?.trim() || null,
      }

      const url = isEdit ? `/api/videos/${video!.id}` : "/api/videos"
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }

      const saved = await res.json()
      toast.success(isEdit
        ? notify ? "Video updated — team notified" : "Video updated"
        : "Video created"
      )
      onSuccess?.(saved.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="vf-slug">Slug</Label>
        <Input
          id="vf-slug"
          {...slugRegister}
          placeholder="SLUG"
          aria-invalid={!!errors.slug}
          onBlur={(e) => {
            setValue("slug", e.target.value.toUpperCase(), { shouldValidate: true })
            slugOnBlur(e)
          }}
        />
        <p className="text-xs text-muted-foreground">
          All caps with spaces (e.g. FIRE STATION TOUR)
        </p>
        {errors.slug && (
          <p className="text-xs text-destructive">{errors.slug.message}</p>
        )}
      </div>

      {/* Budget Line */}
      <div className="space-y-1.5">
        <Label htmlFor="vf-budget">Budget Line</Label>
        <textarea
          id="vf-budget"
          {...register("budgetLine")}
          rows={3}
          placeholder="One-line description of the video"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-invalid={!!errors.budgetLine}
        />
        {errors.budgetLine && (
          <p className="text-xs text-destructive">{errors.budgetLine.message}</p>
        )}
      </div>

      {/* Status + Enterprise */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[180px] space-y-1.5">
          <Label htmlFor="vf-status">Status</Label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="vf-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STORY_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.status && (
            <p className="text-xs text-destructive">{errors.status.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-7">
          <Controller
            name="isEnterprise"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="vf-enterprise"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="vf-enterprise" className="cursor-pointer font-normal">
            Add to Enterprise Budget
          </Label>
        </div>
      </div>

      {/* Associated Story */}
      <div className="space-y-1.5">
        <Label>Associated Story</Label>
        <Popover open={storyPickerOpen} onOpenChange={setStoryPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={storyPickerOpen}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">{selectedStoryLabel ?? "None (standalone)"}</span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search stories..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {searching ? (
                  <CommandEmpty>Loading…</CommandEmpty>
                ) : storyResults.length === 0 && query ? (
                  <CommandEmpty>No stories found.</CommandEmpty>
                ) : (
                  <>
                    <CommandGroup>
                      <CommandItem
                        value="none-standalone"
                        onSelect={() => {
                          setValue("storyId", null)
                          setStoryPickerOpen(false)
                        }}
                      >
                        <Check className={cn("mr-2 size-4", !storyId ? "opacity-100" : "opacity-0")} />
                        None (standalone)
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading={query ? "Search Results" : "Recent Stories"}>
                      {storyResults.map((story) => (
                        <CommandItem
                          key={story.id}
                          value={story.id}
                          onSelect={() => {
                            setValue("storyId", story.id)
                            setStoryPickerOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              storyId === story.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{story.slug}</span>
                            <span className="text-xs text-muted-foreground">
                              {story.budgetLine.slice(0, 60)}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Online Pub Date */}
      <div className="space-y-1.5">
        <Label>Online Pub Date</Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Controller
              name="onlinePubDateTBD"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="vf-online-tbd"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="vf-online-tbd" className="cursor-pointer font-normal text-sm">
              TBD
            </Label>
          </div>

          {!onlinePubDateTBD && (
            <Controller
              name="onlinePubDate"
              control={control}
              render={({ field }) => (
                <DateTimePicker
                  value={field.value ?? null}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </div>
        {errors.onlinePubDate && (
          <p className="text-xs text-destructive">{String(errors.onlinePubDate.message)}</p>
        )}
      </div>

      {/* Platform URLs */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Platform Links</p>
        {(["youtubeUrl", "reelsUrl", "tiktokUrl", "otherUrl"] as const).map((field) => {
          const labels: Record<typeof field, string> = {
            youtubeUrl: "YouTube",
            reelsUrl: "Reels",
            tiktokUrl: "TikTok",
            otherUrl: "Other",
          }
          return (
            <div key={field} className="flex items-center gap-3">
              <Label htmlFor={`vf-${field}`} className="w-16 shrink-0 text-sm">
                {labels[field]}
              </Label>
              <Input
                id={`vf-${field}`}
                {...register(field)}
                placeholder="https://"
                className="flex-1"
              />
              {errors[field] && (
                <p className="text-xs text-destructive">{errors[field]?.message}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="vf-notes">Notes</Label>
        <textarea
          id="vf-notes"
          {...register("notes")}
          rows={4}
          placeholder="Additional notes..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {errors.notes && (
          <p className="text-xs text-destructive">{errors.notes.message}</p>
        )}
      </div>

      {/* AI Contributed */}
      <div className="flex items-center gap-2">
        <Controller
          name="aiContributed"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="vf-ai"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="vf-ai" className="cursor-pointer font-normal">
          AI Contributed
        </Label>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        {isEdit && (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => { notifyRef.current = true; handleSubmit(onSubmit)() }}
          >
            {isSubmitting ? "Saving..." : "Save & Notify Team"}
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Video"}
        </Button>
      </div>
    </form>
  )
}
