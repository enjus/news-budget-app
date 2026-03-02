"use client"

import { useState } from "react"
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
import { useStories } from "@/lib/hooks/useStories"
import type { VideoWithRelations } from "@/types/index"

const STATUS_OPTIONS = [
  "DRAFT",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
] as const

function toLocalDatetimeValue(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface VideoFormProps {
  video?: VideoWithRelations
  onSuccess?: (id: string) => void
}

export function VideoForm({ video, onSuccess }: VideoFormProps) {
  const isEdit = !!video
  const [storyPickerOpen, setStoryPickerOpen] = useState(false)

  const { stories, isLoading: storiesLoading } = useStories()

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
        }
      : {
          slug: "",
          budgetLine: "",
          isEnterprise: false,
          status: "DRAFT",
          storyId: null,
          onlinePubDate: null,
          onlinePubDateTBD: true,
          notes: "",
          notifyTeam: false,
        },
  })

  const onlinePubDateTBD = watch("onlinePubDateTBD")
  const storyId = watch("storyId")

  const selectedStory = stories.find((s) => s.id === storyId) ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    try {
      const payload: Record<string, unknown> = {
        ...data,
        onlinePubDate: data.onlinePubDateTBD
          ? null
          : data.onlinePubDate
            ? new Date(data.onlinePubDate).toISOString()
            : null,
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
      toast.success(isEdit ? "Video updated" : "Video created")
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
          {...register("slug")}
          placeholder="my-video-slug"
          aria-invalid={!!errors.slug}
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens only
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
            Enterprise piece
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
              {selectedStory
                ? `${selectedStory.slug} — ${selectedStory.budgetLine.slice(0, 50)}`
                : "None (standalone)"}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search stories..." />
              <CommandList>
                {storiesLoading ? (
                  <CommandEmpty>Loading...</CommandEmpty>
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
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            !storyId ? "opacity-100" : "opacity-0"
                          )}
                        />
                        None (standalone)
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Stories">
                      {stories.map((story) => (
                        <CommandItem
                          key={story.id}
                          value={`${story.slug} ${story.budgetLine}`}
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
                    {stories.length === 0 && (
                      <CommandEmpty>No stories found.</CommandEmpty>
                    )}
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
                <Input
                  type="datetime-local"
                  className="flex-1"
                  value={field.value ? toLocalDatetimeValue(field.value) : ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      field.onChange(null)
                    } else {
                      field.onChange(new Date(e.target.value).toISOString())
                    }
                  }}
                  aria-invalid={!!errors.onlinePubDate}
                />
              )}
            />
          )}
        </div>
        {errors.onlinePubDate && (
          <p className="text-xs text-destructive">{String(errors.onlinePubDate.message)}</p>
        )}
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

      {/* Notify Team */}
      <div className="flex items-center gap-2">
        <Controller
          name="notifyTeam"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="vf-notify"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="vf-notify" className="cursor-pointer font-normal">
          Notify team when published
        </Label>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Video"}
        </Button>
      </div>
    </form>
  )
}
