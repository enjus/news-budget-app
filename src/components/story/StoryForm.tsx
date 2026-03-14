"use client"

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { X } from "lucide-react"
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
import { format } from "date-fns"
import { STORY_STATUS_LABELS, PERSON_ROLE_LABELS, todayString, canEditPrint } from "@/lib/utils"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { PersonPicker, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import type { StoryWithRelations } from "@/types/index"
import type { Person } from "@/types/index"

const STATUS_OPTIONS = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
] as const

interface StoryFormInitialValues {
  onlinePubDate?: string | null
  onlinePubDateTBD?: boolean
  printPubDate?: string | null
  printPubDateTBD?: boolean
  isEnterprise?: boolean
}

export interface StoryFormHandle {
  submitNormal: () => void
  submitNotify: () => void
}

interface StoryFormProps {
  story?: StoryWithRelations
  initialValues?: StoryFormInitialValues
  onSuccess?: (id: string) => void
}

interface PendingAssignment {
  person: Person
  role: AssignmentRoleValue
}

function toLocalDateValue(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const StoryForm = forwardRef<StoryFormHandle, StoryFormProps>(
function StoryForm({ story, initialValues, onSuccess }, ref) {
  const isEdit = !!story
  const router = useRouter()

  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateStoryInput>({
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

  const { data: session } = useSession()
  const canEditPrintDate = canEditPrint(session?.user?.appRole ?? "")

  const onlinePubDateTBD = watch("onlinePubDateTBD")
  const printPubDateTBD = watch("printPubDateTBD")
  const printPubDate = watch("printPubDate")
  const watchedStatus = watch("status")
  const watchedIsEnterprise = watch("isEnterprise")
  const watchedAiContributed = watch("aiContributed")

  const { onBlur: slugOnBlur, ...slugRegister } = register("slug")

  const notifyRef = useRef(false)

  // Auto-save status, isEnterprise, aiContributed on change (edit mode only).
  // Does NOT call onSuccess — avoids remounting the form and losing unsaved text edits.
  const autoSaveMounted = useRef(false)
  const prevAutoSaveValues = useRef({ status: watchedStatus, isEnterprise: watchedIsEnterprise, aiContributed: watchedAiContributed })
  useEffect(() => {
    if (!isEdit) return
    if (!autoSaveMounted.current) {
      autoSaveMounted.current = true
      return
    }
    const prev = prevAutoSaveValues.current
    const message = watchedStatus !== prev.status
      ? `Status → ${STORY_STATUS_LABELS[watchedStatus] ?? watchedStatus}`
      : "Saved"
    prevAutoSaveValues.current = { status: watchedStatus, isEnterprise: watchedIsEnterprise, aiContributed: watchedAiContributed }
    fetch(`/api/stories/${story!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: watchedStatus, isEnterprise: watchedIsEnterprise, aiContributed: watchedAiContributed }),
    })
      .then((res) => res.ok ? toast.success(message, { duration: 2000 }) : res.json().then((j) => { throw new Error(j?.error) }))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Auto-save failed"))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedStatus, watchedIsEnterprise, watchedAiContributed])

  useImperativeHandle(ref, () => ({
    submitNormal: () => { notifyRef.current = false; handleSubmit(onSubmit)() },
    submitNotify: () => { notifyRef.current = true; handleSubmit(onSubmit)() },
  }))

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

      // Post pending assignments after story creation
      if (!isEdit && pendingAssignments.length > 0) {
        await Promise.all(
          pendingAssignments.map((a) =>
            fetch(`/api/stories/${saved.id}/assignments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ personId: a.person.id, role: a.role }),
            })
          )
        )
      }

      const budgetDate = saved.onlinePubDateTBD || !saved.onlinePubDate
        ? todayString()
        : new Date(saved.onlinePubDate).toISOString().slice(0, 10)
      toast.success(
        isEdit ? (notify ? "Story updated — team notified" : "Story updated") : "Story created",
        { action: { label: "See on budget", onClick: () => router.push(`/budget/daily/${budgetDate}`) } }
      )
      onSuccess?.(saved.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  const assignedIds = pendingAssignments.map((a) => a.person.id)

  const submitButton = (
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Story"}
    </Button>
  )

  return (
    <form id="story-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Top action row — create mode only */}
      {!isEdit && (
        <div className="flex justify-end">
          {submitButton}
        </div>
      )}

      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-slug">Slug</Label>
        <Input
          id="sf-slug"
          {...slugRegister}
          placeholder="SLUG"
          aria-invalid={!!errors.slug}
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
          placeholder="One- to three-sentence summary of the story"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20"
          aria-invalid={!!errors.budgetLine}
        />
        {errors.budgetLine && (
          <p className="text-xs text-destructive">{errors.budgetLine.message}</p>
        )}
      </div>

      {/* Assignments — create mode inline */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>People</Label>
          {pendingAssignments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAssignments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium"
                >
                  {a.person.name}
                  <span className="text-muted-foreground/70">
                    · {PERSON_ROLE_LABELS[a.role] ?? a.role}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingAssignments((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-0.5 rounded text-muted-foreground/60 hover:text-foreground"
                    aria-label="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <PersonPicker
            onSelect={(person, role) =>
              setPendingAssignments((prev) => [...prev, { person, role }])
            }
            excludeIds={assignedIds}
            label="Add person"
          />
        </div>
      )}

      {/* Status + Word Count + Enterprise */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[160px] space-y-1.5">
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

        <div className="w-28 space-y-1.5">
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
            Enterprise
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

      {/* Print/Online Newspaper Date — editable for admin/leadership only */}
      {canEditPrintDate ? (
        <div className="space-y-1.5">
          <Label>Print/Online Newspaper Date</Label>
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
                    className="w-auto"
                    value={field.value ? toLocalDateValue(field.value) : ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        field.onChange(null)
                      } else {
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
      ) : !printPubDateTBD && printPubDate ? (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Print/Online Newspaper Date</Label>
          <p className="text-sm text-muted-foreground">
            {format(new Date(toLocalDateValue(printPubDate) + "T00:00:00"), "EEEE, MMM d, yyyy")}
          </p>
        </div>
      ) : null}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-notes">Notes</Label>
        <textarea
          id="sf-notes"
          {...register("notes")}
          rows={isEdit ? 4 : 2}
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

      {/* Post URL — edit mode only, last field (post-publication) */}
      {isEdit && (
        <div className="space-y-1.5">
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
      )}

      {/* Bottom actions — create mode only; edit mode buttons live in StoryDetail */}
      {!isEdit && (
        <div className="flex justify-end gap-2 pt-2">
          {submitButton}
        </div>
      )}
    </form>
  )
})
StoryForm.displayName = "StoryForm"
