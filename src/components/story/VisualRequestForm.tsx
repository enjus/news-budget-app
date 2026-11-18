"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiPath } from "@/lib/api-path"
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning"
import { parseDataUrl } from "@/lib/visual-requests"
import { VISUAL_TYPE_LABELS, type VisualTypeValue } from "@/lib/visual-types"

export const UNLINKED_ACCOUNT_MESSAGE =
  "Your account isn't linked to a Person yet. Ask an admin to link it before filing a visual request."

const TEXTAREA_CLASS =
  "w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"

/** The fields of a request that "Edit details" can change, as GET /api/visuals/[id] returns them. */
export interface EditableRequestFields {
  type: string
  priority: string
  description: string | null
  eventDateTime: string | null
  location: string | null
  deadline: string | null
  notes: string | null
  dataUrl: string | null
}

interface VisualRequestFormProps {
  /**
   * The story to file the request on. Without it (and without `editing`) the
   * form files a standalone request through POST /api/visuals, for /requests/new.
   * Ignored when `editing`.
   */
  storyId?: string
  /** No longer read: the description placeholder is a fixed example. Kept so callers needn't change. */
  budgetLine?: string
  /** Prefills the deadline: the story's online pub date (newsroom-time-as-UTC ISO), when it has one. */
  defaultDeadline?: string | null
  /** Edit an existing request instead of filing one: PATCHes /api/visuals/[id] with every field. */
  editing?: { id: string; initial: EditableRequestFields }
  /** Called after a successful save, with the request the server returned. */
  onSubmitted: (visual: { id: string }) => void
  onCancel: () => void
}

/** Optional date/time: the shared DateTimePicker plus a way to clear it (the picker has none). */
function OptionalDateTime({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <DateTimePicker value={value} onChange={onChange} className="h-8" />
      {value && (
        <Button type="button" size="icon-xs" variant="ghost" onClick={() => onChange(null)} aria-label="Clear date">
          <X className="size-3" />
        </Button>
      )}
    </div>
  )
}

/**
 * "Request" form in a story's Visuals section: files a REQUESTED visual that the
 * visuals desk can pick up. The requester is the signed-in user's Person, so the
 * account has to be linked to one. eventDateTime/deadline come from DateTimePicker
 * already in newsroom-time-as-UTC (the same values StoryForm sends for pub dates)
 * and are passed through untouched.
 *
 * With no `storyId` it files a standalone request (POST /api/visuals), which
 * can be attached to a story later from its request page. That's a whole page
 * of its own, so it gets the unsaved-changes guard StoryForm uses.
 *
 * With `editing`, the same form edits an existing request's details on its
 * request page: prefilled, PATCHed, and no linked Person needed (the server's
 * "update" rule decides who may edit).
 */
export function VisualRequestForm({ storyId, defaultDeadline, editing, onSubmitted, onCancel }: VisualRequestFormProps) {
  const { data: session, status: sessionStatus } = useSession()
  const unlinked = !editing && sessionStatus === "authenticated" && !session?.user?.personId
  const initial = editing?.initial
  const standalone = !editing && storyId === undefined

  const [type, setType] = useState<VisualTypeValue>((initial?.type as VisualTypeValue) ?? "PHOTO")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">(initial?.priority === "URGENT" ? "URGENT" : "NORMAL")
  const [eventDateTime, setEventDateTime] = useState<string | null>(initial?.eventDateTime ?? null)
  const [location, setLocation] = useState(initial?.location ?? "")
  const [deadline, setDeadline] = useState<string | null>(initial ? initial.deadline : (defaultDeadline ?? null))
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [dataUrl, setDataUrl] = useState(initial?.dataUrl ?? "")
  const [submitting, setSubmitting] = useState(false)

  // Same checks the server runs (requestVisualSchema); the inline errors just save a round trip.
  const link = parseDataUrl(dataUrl)
  const hasDescription = description.trim() !== ""
  const canSubmit = sessionStatus === "authenticated" && !unlinked && hasDescription && link.ok && !submitting

  // Only the standalone page: the inline story form sits inside a page that
  // has its own guards, and a reload there loses little.
  const [saved, setSaved] = useState(false)
  const dirty = [description, location, notes, dataUrl].some((v) => v.trim() !== "") || eventDateTime !== null || deadline !== null
  useUnsavedChangesWarning(standalone && dirty && !saved, "Leave this page? Your visual request hasn't been filed yet.")

  async function handleSubmit() {
    if (!canSubmit || !link.ok) return
    setSubmitting(true)
    try {
      let res: Response
      if (editing) {
        // Every field, with null clearing what was emptied.
        const body = {
          type,
          priority,
          description: description.trim(),
          eventDateTime,
          location: location.trim() || null,
          deadline,
          notes: notes.trim() || null,
          dataUrl: link.value,
        }
        res = await fetch(apiPath(`/api/visuals/${editing.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        const body: Record<string, unknown> = { status: "REQUESTED", type, priority, description: description.trim() }
        if (eventDateTime) body.eventDateTime = eventDateTime
        if (location.trim()) body.location = location.trim()
        if (deadline) body.deadline = deadline
        if (notes.trim()) body.notes = notes.trim()
        if (link.value) body.dataUrl = link.value
        res = await fetch(apiPath(standalone ? "/api/visuals" : `/api/stories/${storyId}/visuals`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to ${editing ? "save request" : "file request"} (${res.status})`)
      }
      const json = await res.json().catch(() => ({}))
      setSaved(true)
      toast.success(editing ? "Request updated" : "Visual requested")
      onSubmitted({ id: json?.id ?? editing?.id ?? "" })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : editing ? "Failed to save request" : "Failed to file request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">{editing ? "Edit request" : "Request a visual"}</p>

      {unlinked && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {UNLINKED_ACCOUNT_MESSAGE}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as VisualTypeValue)}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISUAL_TYPE_LABELS) as VisualTypeValue[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {VISUAL_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as "NORMAL" | "URGENT")}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="vr-description">What do you need?</Label>
          <textarea
            id="vr-description"
            className={TEXTAREA_CLASS}
            rows={2}
            maxLength={500}
            autoComplete="off"
            required
            aria-required
            placeholder={
              standalone
                ? "e.g. Gov. Kotek speaks in Portland on Tuesday; update our file photos"
                : "e.g. Portrait of the new superintendent for Sunday's story"
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {!hasDescription && (
            <p className="text-xs text-muted-foreground">
              {standalone
                ? "Required: say what the visuals desk should produce, and what it's for."
                : "Required: say what the visuals desk should produce."}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Event date &amp; time</Label>
          <OptionalDateTime value={eventDateTime} onChange={setEventDateTime} />
        </div>
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="vr-location">Location</Label>
          <Input
            id="vr-location"
            className="h-8"
            maxLength={200}
            autoComplete="off"
            placeholder="Where is it happening?"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Needed by</Label>
          <OptionalDateTime value={deadline} onChange={setDeadline} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vr-notes">Notes (optional)</Label>
        <textarea
          id="vr-notes"
          className={TEXTAREA_CLASS}
          rows={2}
          maxLength={2000}
          autoComplete="off"
          placeholder="Contact on site, shots you need, anything else the desk should know"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vr-data-url">Link to data (optional)</Label>
        <Input
          id="vr-data-url"
          type="url"
          inputMode="url"
          className="h-8"
          autoComplete="off"
          placeholder="https://"
          value={dataUrl}
          onChange={(e) => setDataUrl(e.target.value)}
          aria-invalid={!link.ok}
        />
        {link.ok ? (
          <p className="text-xs text-muted-foreground">
            SharePoint, OneDrive, or Google Sheets link. Make sure the visuals desk can open it.
          </p>
        ) : (
          <p className="text-xs text-destructive">{link.error}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {!editing && <Send className="size-4" />}
          {editing ? (submitting ? "Saving..." : "Save changes") : submitting ? "Requesting..." : "Request visual"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
