"use client"

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { X } from "lucide-react"
import { UserPlus } from "lucide-react"
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
import { STORY_STATUS_LABELS, PERSON_ROLE_LABELS, todayString, canEditPrint, toStoryAssignmentRole, cn, INDICATOR_OPTIONS, STORY_TAG_LABELS } from "@/lib/utils"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { PersonPicker, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import {
  VisualDraftRow,
  VISUAL_TYPE_LABELS,
  visualDraftToBody,
  type VisualDraft,
} from "./VisualDraftRow"
import type { StoryWithRelations } from "@/types/index"
import type { Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"

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

/**
 * POST a batch of child records after the story is created, returning how many
 * failed. These run after the story already exists, so a failure can't be
 * reported as "creation failed" — the caller has to name what didn't attach.
 * Previously these were bare Promise.all calls that ignored res.ok entirely,
 * so a rejected assignment vanished behind a "Story created" toast.
 */
async function postAll(url: string, bodies: unknown[]): Promise<number> {
  const results = await Promise.allSettled(
    bodies.map(async (body) => {
      const res = await fetch(apiPath(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
  )
  return results.filter((r) => r.status === "rejected").length
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
  // Visuals composed before the story exists. POSTed after create, alongside
  // pendingAssignments — there's no storyId to attach them to until then.
  const [pendingVisuals, setPendingVisuals] = useState<VisualDraft[]>([])

  // Set when a save loses the optimistic-locking race. Holds the version the
  // server now has, so "Save anyway" can retry against it. Non-null means the
  // conflict banner is showing and the user's unsaved text is still in the form.
  const [conflict, setConflict] = useState<{ serverVersion: number } | null>(null)

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
          workingDraftUrl: story.workingDraftUrl ?? "",
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
          workingDraftUrl: "",
        },
  })

  // Editorial campaign tags (StoryTag rows) — kept as local state since they're
  // not Story columns. Edit mode auto-saves each toggle immediately, mirroring
  // the isEnterprise/aiContributed/status auto-save below. Create mode posts
  // them after the story is created, like pendingAssignments.
  const [selectedTags, setSelectedTags] = useState<string[]>(
    () => story?.tags.map((t) => t.tag) ?? []
  )

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
  const draftRef = useRef(false)
  // Set only by "Save anyway" — the version to send instead of the stale one in
  // props, which is what the failed save already tried.
  const overrideVersionRef = useRef<number | null>(null)

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
    fetch(apiPath(`/api/stories/${story!.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: watchedStatus, isEnterprise: watchedIsEnterprise, aiContributed: watchedAiContributed }),
    })
      .then((res) => res.ok ? toast.success(message, { duration: 2000 }) : res.json().then((j) => { throw new Error(j?.error) }))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Auto-save failed"))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedStatus, watchedIsEnterprise, watchedAiContributed])

  useImperativeHandle(ref, () => ({
    submitNormal: () => { notifyRef.current = false; draftRef.current = false; handleSubmit(onSubmit)() },
    submitNotify: () => { notifyRef.current = true; draftRef.current = false; handleSubmit(onSubmit)() },
  }))

  // Toggle any indicator chip (Enterprise, AI Contributed, or an editorial tag).
  // Enterprise/AI are real form fields (picked up by the auto-save effect above).
  // Tags live outside the form — edit mode auto-saves the diff immediately.
  function toggleIndicator(value: string) {
    if (value === "ENTERPRISE") {
      setValue("isEnterprise", !watchedIsEnterprise, { shouldDirty: true })
      return
    }
    if (value === "AI_CONTRIBUTED") {
      setValue("aiContributed", !watchedAiContributed, { shouldDirty: true })
      return
    }
    const removing = selectedTags.includes(value)
    setSelectedTags((prev) => (removing ? prev.filter((t) => t !== value) : [...prev, value]))
    if (isEdit && story) {
      const label = STORY_TAG_LABELS[value] ?? value
      if (removing) {
        fetch(apiPath(`/api/stories/${story.id}/tags?tag=${value}`), { method: "DELETE" })
          .then((res) => { if (!res.ok) throw new Error() })
          .then(() => toast.success(`Removed ${label}`, { duration: 2000 }))
          .catch(() => toast.error(`Failed to remove ${label}`))
      } else {
        fetch(apiPath(`/api/stories/${story.id}/tags`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: value }),
        })
          .then((res) => { if (!res.ok) throw new Error() })
          .then(() => toast.success(`Added ${label}`, { duration: 2000 }))
          .catch(() => toast.error(`Failed to add ${label}`))
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    const notify = notifyRef.current
    const isDraft = draftRef.current
    notifyRef.current = false
    draftRef.current = false
    try {
      const payload: Record<string, unknown> = {
        ...data,
        notifyTeam: notify,
        ...(isDraft && !isEdit ? { onBudget: false } : {}),
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

      // Include version for optimistic locking on edits. After a conflict the
      // version in props is stale — it's the one that just lost — so a retry
      // sends the version the server reported back instead.
      const retryVersion = overrideVersionRef.current
      overrideVersionRef.current = null
      if (isEdit && retryVersion !== null) {
        payload.version = retryVersion
      } else if (isEdit && story?.version !== undefined) {
        payload.version = story.version
      }

      const url = apiPath(isEdit ? `/api/stories/${story!.id}` : "/api/stories")
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (res.status === 409 && json?.version !== undefined) {
          // Deliberately does NOT call onSuccess: that refetch remounts the form
          // (StoryDetail keys it on updatedAt) and would discard everything the
          // user typed. Show the banner and let them choose.
          setConflict({ serverVersion: json.version })
          toast.error("Someone else saved this story — see the notice at the top of the form")
          return
        }
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }

      const saved = await res.json()
      setConflict(null)

      // Attach everything composed before the story had an id. Each batch
      // reports its own failures — the story itself is already saved, so a
      // partial failure has to be named rather than swallowed.
      if (!isEdit) {
        const failed: string[] = []

        if (pendingAssignments.length > 0) {
          const n = await postAll(
            `/api/stories/${saved.id}/assignments`,
            pendingAssignments.map((a) => ({ personId: a.person.id, role: a.role }))
          )
          if (n > 0) failed.push(`${n} of ${pendingAssignments.length} people`)
        }

        if (pendingVisuals.length > 0) {
          const n = await postAll(
            `/api/stories/${saved.id}/visuals`,
            pendingVisuals.map(visualDraftToBody)
          )
          if (n > 0) failed.push(`${n} of ${pendingVisuals.length} visuals`)
        }

        if (selectedTags.length > 0) {
          const n = await postAll(
            `/api/stories/${saved.id}/tags`,
            selectedTags.map((tag) => ({ tag }))
          )
          if (n > 0) failed.push(`${n} of ${selectedTags.length} tags`)
        }

        if (failed.length > 0) {
          toast.warning(`Story saved, but ${failed.join(" and ")} could not be added`, {
            description: "Open the story and add them again.",
            duration: 10000,
          })
        }
      }

      if (isDraft && !isEdit) {
        toast.success("Saved as draft")
        router.push("/me")
        return
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

  // "Add me" — available when session user has a linked Person and isn't already assigned
  const myPersonId = session?.user?.personId
  const myDefaultRole = session?.user?.personDefaultRole
  const alreadyAssignedMe = myPersonId ? assignedIds.includes(myPersonId) : true

  const submitButton = (
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Story"}
    </Button>
  )

  const draftButton = !isEdit ? (
    <Button
      type="button"
      variant="outline"
      disabled={isSubmitting}
      onClick={() => { draftRef.current = true; handleSubmit(onSubmit)() }}
    >
      Save as Draft
    </Button>
  ) : null

  return (
    <form id="story-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Save conflict — the user's unsaved edits are still in the fields below */}
      {conflict && (
        <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Someone else saved this story while you were editing.
          </p>
          <p className="text-sm text-muted-foreground">
            Your changes are still here and have not been saved. Saving anyway will
            overwrite the other person&apos;s edits — if you&apos;re not sure what they
            changed, copy your work somewhere safe and reload first.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => {
                overrideVersionRef.current = conflict.serverVersion
                handleSubmit(onSubmit)()
              }}
            >
              Save anyway
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setConflict(null)
                onSuccess?.(story!.id)
              }}
            >
              Discard mine and reload
            </Button>
          </div>
        </div>
      )}

      {/* Top action row — create mode only */}
      {!isEdit && (
        <div className="flex justify-end gap-2">
          {draftButton}
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
          <div className="flex items-center gap-2">
            <PersonPicker
              onSelect={(person, role) =>
                setPendingAssignments((prev) => [...prev, { person, role }])
              }
              excludeIds={assignedIds}
              label="Add person"
            />
            {myPersonId && myDefaultRole && !alreadyAssignedMe && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch(apiPath(`/api/people/${myPersonId}`))
                    if (!res.ok) throw new Error("Could not load your profile")
                    const person = await res.json()
                    const role = toStoryAssignmentRole(myDefaultRole) as AssignmentRoleValue
                    setPendingAssignments((prev) => [...prev, { person, role }])
                  } catch {
                    toast.error("Could not add you — profile not found")
                  }
                }}
              >
                <UserPlus className="size-3.5 mr-1.5" />
                Add me
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Visuals — create mode inline; edit mode uses VisualSection on the detail page */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>Visuals</Label>
          {pendingVisuals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingVisuals.map((v, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium"
                >
                  {VISUAL_TYPE_LABELS[v.type]}
                  {v.description && (
                    <span className="text-muted-foreground/70">· {v.description}</span>
                  )}
                  {v.person && (
                    <span className="text-muted-foreground/70">· {v.person.name}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingVisuals((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-0.5 rounded text-muted-foreground/60 hover:text-foreground"
                    aria-label="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <VisualDraftRow onSubmit={(draft) => setPendingVisuals((prev) => [...prev, draft])} />
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

      {/* Working Draft URL */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-working-draft-url">Working Draft URL</Label>
        <Input
          id="sf-working-draft-url"
          {...register("workingDraftUrl")}
          placeholder="https://"
        />
        {errors.workingDraftUrl && (
          <p className="text-xs text-destructive">{errors.workingDraftUrl.message as string}</p>
        )}
      </div>

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

      {/* Tags — Enterprise/AI are real fields (auto-save above); the rest are tags */}
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {INDICATOR_OPTIONS.map((opt) => {
            const active = opt.value === "ENTERPRISE"
              ? watchedIsEnterprise
              : opt.value === "AI_CONTRIBUTED"
                ? watchedAiContributed
                : selectedTags.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleIndicator(opt.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? cn(opt.color, "border-transparent") : "border-input text-muted-foreground hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
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
          {draftButton}
          {submitButton}
        </div>
      )}
    </form>
  )
})
StoryForm.displayName = "StoryForm"
