"use client"

import { forwardRef, useImperativeHandle } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  createMediaRequestSchema,
  type CreateMediaRequestInput,
} from "@/lib/validations"
import {
  MEDIA_REQUEST_TYPE_LABELS,
  MEDIA_REQUEST_PRIORITY_LABELS,
} from "@/lib/utils"
import type { MediaRequestWithRelations } from "@/types/index"

const TYPE_OPTIONS = ["PHOTO", "VIDEO", "PHOTO_VIDEO", "GRAPHIC", "MAP"] as const
const PRIORITY_OPTIONS = ["NORMAL", "URGENT"] as const

export interface MediaRequestFormHandle {
  submit: () => void
}

interface MediaRequestFormProps {
  mediaRequest?: MediaRequestWithRelations
  requestedById: string
  storyId?: string | null
  onSuccess?: (id: string) => void
  compact?: boolean
}

export const MediaRequestForm = forwardRef<MediaRequestFormHandle, MediaRequestFormProps>(
function MediaRequestForm({ mediaRequest, requestedById, storyId, onSuccess, compact }, ref) {
  const isEdit = !!mediaRequest
  const router = useRouter()

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateMediaRequestInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createMediaRequestSchema) as any,
    defaultValues: mediaRequest
      ? {
          title: mediaRequest.title,
          type: mediaRequest.type as CreateMediaRequestInput["type"],
          priority: mediaRequest.priority as CreateMediaRequestInput["priority"],
          storyId: mediaRequest.storyId ?? null,
          requestedById: mediaRequest.requestedById,
          eventDateTime: mediaRequest.eventDateTime
            ? new Date(mediaRequest.eventDateTime).toISOString()
            : null,
          location: mediaRequest.location ?? "",
          description: mediaRequest.description ?? "",
          notes: mediaRequest.notes ?? "",
          deadline: mediaRequest.deadline
            ? new Date(mediaRequest.deadline).toISOString()
            : null,
        }
      : {
          title: "",
          type: "PHOTO",
          priority: "NORMAL",
          storyId: storyId ?? null,
          requestedById,
          eventDateTime: null,
          location: "",
          description: "",
          notes: "",
          deadline: null,
        },
  })

  const watchedType = watch("type")

  useImperativeHandle(ref, () => ({
    submit: () => handleSubmit(onSubmit)(),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    try {
      const payload = {
        ...data,
        eventDateTime: data.eventDateTime ? new Date(data.eventDateTime).toISOString() : null,
        deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
        location: data.location || null,
        description: data.description || null,
        notes: data.notes || null,
      }

      const url = isEdit ? `/api/media-requests/${mediaRequest!.id}` : "/api/media-requests"
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
      toast.success(isEdit ? "Request updated" : "Media request created")
      onSuccess?.(saved.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  const showEventFields = ["PHOTO", "VIDEO", "PHOTO_VIDEO"].includes(watchedType)

  return (
    <form id="media-request-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="mr-title">Title</Label>
        <Input
          id="mr-title"
          {...register("title")}
          placeholder="e.g. Mayor press conference photos"
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {/* Type + Priority */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[160px] space-y-1.5">
          <Label>Type</Label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MEDIA_REQUEST_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="flex-1 min-w-[140px] space-y-1.5">
          <Label>Priority</Label>
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {MEDIA_REQUEST_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="mr-desc">Description</Label>
        <textarea
          id="mr-desc"
          {...register("description")}
          rows={compact ? 2 : 3}
          placeholder="What do you need?"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      {/* Event date + location — only for photo/video types */}
      {showEventFields && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label>Event Date & Time</Label>
            <Controller
              name="eventDateTime"
              control={control}
              render={({ field }) => (
                <DateTimePicker
                  value={field.value ?? null}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="mr-location">Location</Label>
            <Input
              id="mr-location"
              {...register("location")}
              placeholder="e.g. 123 High St, City Hall, Room 305"
            />
            <p className="text-xs text-muted-foreground">
              Include a full street address so specialists can navigate there.
            </p>
          </div>
        </div>
      )}

      {/* Deadline */}
      <div className="space-y-1.5">
        <Label>Deadline</Label>
        <Controller
          name="deadline"
          control={control}
          render={({ field }) => (
            <DateTimePicker
              value={field.value ?? null}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {/* Notes */}
      {!compact && (
        <div className="space-y-1.5">
          <Label htmlFor="mr-notes">Notes</Label>
          <textarea
            id="mr-notes"
            {...register("notes")}
            rows={2}
            placeholder="Additional notes..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      )}

      {/* Hidden fields */}
      <input type="hidden" {...register("requestedById")} />
      <input type="hidden" {...register("storyId")} />

      {/* Submit — only in standalone mode; detail page uses ref */}
      {!isEdit && !compact && (
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Request"}
          </Button>
        </div>
      )}

      {compact && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </div>
      )}
    </form>
  )
})
MediaRequestForm.displayName = "MediaRequestForm"
