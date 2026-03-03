"use client"

import { useRef, useEffect } from "react"
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
import { DateTimePicker } from "@/components/ui/date-time-picker"
import type { StoryWithRelations } from "@/types/index"

const STATUS_OPTIONS = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
] as const

interface StoryFormInitialValues {
  onlinePubDate?: string | null
  onlinePubDateTBD?: boolean
  printPubDate?: string | null
  printPubDateTBD?: boolean
  isEnterprise?: boolean
}

interface StoryFormProps {
  story?: StoryWithRelations
  initialValues?: StoryFormInitialValues
  onSuccess?: (id: string) => void
}


function toLocalDateValue(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StoryForm({ story, initialValues, onSuccess }: StoryFormProps) {
  const isEdit = !!story

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
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
          wordCount: (story as any).wordCount ?? null,
          notifyTeam: story.notifyTeam,
          aiContributed: story.aiContributed,
          postUrl: story.postUrl ?? "",
        }
      : {
          slug: "",
          budgetLine: "",
          isEnterprise: initialValues?.isEnterprise ?? false,
          status: "DRAFT",
          onlinePubDate: initialValues?.onlinePubDate ?? null,
          onlinePubDateTBD: initialValues?.onlinePubDateTBD ?? true,
          printPubDate: initialValues?.printPubDate ?? null,
          printPubDateTBD: initialValues?.printPubDateTBD ?? true,
          notes: "",
          wordCount: null,
          notifyTeam: false,
          aiContributed: false,
          postUrl: "",
        },
  })

  const onlinePubDateTBD = watch("onlinePubDateTBD")
  const printPubDateTBD = watch("printPubDateTBD")
  const budgetLine = watch("budgetLine")

  const { onBlur: slugOnBlur, ...slugRegister } = register("slug")

  // Auto-populate slug from budget line for new stories until the user edits it manually
  const slugManuallyEdited = useRef(false)
  useEffect(() => {
    if (!isEdit && !slugManuallyEdited.current && budgetLine) {
      setValue("slug", budgetLine.toUpperCase().trim(), { shouldValidate: false })
    }
  }, [budgetLine, isEdit, setValue])

  const notifyRef = useRef(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    const notify = notifyRef.current
    notifyRef.current = false
    try {
      // Convert local datetime string to ISO offset string
      const payload: Record<string, unknown> = {
        ...data,
        notifyTeam: notify,
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
      toast.success(isEdit
        ? notify ? "Story updated — team notified" : "Story updated"
        : "Story created"
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
        <Label htmlFor="sf-slug">Slug</Label>
        <Input
          id="sf-slug"
          {...slugRegister}
          placeholder="CITY COUNCIL VOTE"
          aria-invalid={!!errors.slug}
          onChange={(e) => {
            slugManuallyEdited.current = true
            slugRegister.onChange(e)
          }}
          onBlur={(e) => {
            setValue("slug", e.target.value.toUpperCase(), { shouldValidate: true })
            slugOnBlur(e)
          }}
        />
        <p className="text-xs text-muted-foreground">
          All caps with spaces (e.g. CITY COUNCIL VOTE)
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
            Add to Enterprise Budget
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

      {/* Daily Edition Pub Date */}
      <div className="space-y-1.5">
        <Label>Daily Edition Pub Date</Label>
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

      {/* Word Count + Post URL */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-1.5 w-36">
          <Label htmlFor="sf-word-count">Word Count</Label>
          <Input
            id="sf-word-count"
            type="number"
            min={0}
            {...register("wordCount", { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })}
            placeholder="e.g. 800"
          />
          {errors.wordCount && (
            <p className="text-xs text-destructive">{errors.wordCount.message}</p>
          )}
        </div>

        <div className="flex-1 min-w-[200px] space-y-1.5">
          <Label htmlFor="sf-post-url">Post URL</Label>
          <Input
            id="sf-post-url"
            {...register("postUrl")}
            placeholder="https://"
          />
          {errors.postUrl && (
            <p className="text-xs text-destructive">{errors.postUrl.message as string}</p>
          )}
        </div>
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

      {/* AI Contributed */}
      <div className="flex items-center gap-2">
        <Controller
          name="aiContributed"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="sf-ai"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="sf-ai" className="cursor-pointer font-normal">
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
          {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Story"}
        </Button>
      </div>
    </form>
  )
}
