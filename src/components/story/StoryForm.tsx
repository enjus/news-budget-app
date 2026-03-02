"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
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
  createStorySchema,
  type CreateStoryInput,
} from "@/lib/validations"
import { STORY_STATUS_LABELS } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

const STATUS_OPTIONS = [
  "DRAFT",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
] as const

interface StoryFormProps {
  story?: StoryWithRelations
  onSuccess?: (id: string) => void
}

function toLocalDatetimeValue(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toLocalDateValue(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StoryForm({ story, onSuccess }: StoryFormProps) {
  const isEdit = !!story

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateStoryInput>({
    // zodResolver returns Resolver<Input> but form uses Output type; cast is safe here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createStorySchema) as any,
    defaultValues: story
      ? {
          slug: story.slug,
          budgetLine: story.budgetLine,
          isEnterprise: story.isEnterprise,
          status: story.status as CreateStoryInput["status"],
          onlinePubDate: story.onlinePubDate
            ? new Date(story.onlinePubDate).toISOString()
            : null,
          onlinePubDateTBD: story.onlinePubDateTBD,
          printPubDate: story.printPubDate
            ? new Date(story.printPubDate).toISOString()
            : null,
          printPubDateTBD: story.printPubDateTBD,
          notes: story.notes ?? "",
          notifyTeam: story.notifyTeam,
        }
      : {
          slug: "",
          budgetLine: "",
          isEnterprise: false,
          status: "DRAFT",
          onlinePubDate: null,
          onlinePubDateTBD: true,
          printPubDate: null,
          printPubDateTBD: true,
          notes: "",
          notifyTeam: false,
        },
  })

  const onlinePubDateTBD = watch("onlinePubDateTBD")
  const printPubDateTBD = watch("printPubDateTBD")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    try {
      // Convert local datetime string to ISO offset string
      const payload: Record<string, unknown> = {
        ...data,
        onlinePubDate: data.onlinePubDateTBD
          ? null
          : data.onlinePubDate
            ? new Date(data.onlinePubDate).toISOString()
            : null,
        printPubDate: data.printPubDateTBD
          ? null
          : data.printPubDate
            ? new Date(data.printPubDate).toISOString()
            : null,
      }

      const url = isEdit ? `/api/stories/${story!.id}` : "/api/stories"
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
      toast.success(isEdit ? "Story updated" : "Story created")
      onSuccess?.(saved.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-slug">Slug</Label>
        <Input
          id="sf-slug"
          {...register("slug")}
          placeholder="my-story-slug"
          aria-invalid={!!errors.slug}
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens only (e.g. city-council-vote)
        </p>
        {errors.slug && (
          <p className="text-xs text-destructive">{errors.slug.message}</p>
        )}
      </div>

      {/* Budget Line */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-budget">Budget Line</Label>
        <textarea
          id="sf-budget"
          {...register("budgetLine")}
          rows={3}
          placeholder="One-line description of the story"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20"
          aria-invalid={!!errors.budgetLine}
        />
        {errors.budgetLine && (
          <p className="text-xs text-destructive">{errors.budgetLine.message}</p>
        )}
      </div>

      {/* Status + Enterprise row */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[180px] space-y-1.5">
          <Label htmlFor="sf-status">Status</Label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="sf-status">
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
                id="sf-enterprise"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="sf-enterprise" className="cursor-pointer font-normal">
            Enterprise story
          </Label>
        </div>
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
                  id="sf-online-tbd"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="sf-online-tbd" className="cursor-pointer font-normal text-sm">
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

      {/* Print Pub Date */}
      <div className="space-y-1.5">
        <Label>Print Pub Date</Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Controller
              name="printPubDateTBD"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="sf-print-tbd"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="sf-print-tbd" className="cursor-pointer font-normal text-sm">
              TBD
            </Label>
          </div>

          {!printPubDateTBD && (
            <Controller
              name="printPubDate"
              control={control}
              render={({ field }) => (
                <Input
                  type="date"
                  className="flex-1"
                  value={field.value ? toLocalDateValue(field.value) : ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      field.onChange(null)
                    } else {
                      // Store as ISO string with time component
                      field.onChange(new Date(e.target.value + "T00:00:00").toISOString())
                    }
                  }}
                  aria-invalid={!!errors.printPubDate}
                />
              )}
            />
          )}
        </div>
        {errors.printPubDate && (
          <p className="text-xs text-destructive">{String(errors.printPubDate.message)}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-notes">Notes</Label>
        <textarea
          id="sf-notes"
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
              id="sf-notify"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="sf-notify" className="cursor-pointer font-normal">
          Notify team when published
        </Label>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Story"}
        </Button>
      </div>
    </form>
  )
}
