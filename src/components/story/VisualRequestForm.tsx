"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Plus, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiPath } from "@/lib/api-path"
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning"
import { VISUAL_LINKS_MAX, parseVisualLinks, visualLinks } from "@/lib/visual-requests"
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
  /** Prefilled through visualLinks(): `links`, or the legacy `dataUrl` on an older request. */
  links: string[]
  dataUrl: string | null
}

/** One row of the Links field; `key` keeps React rows stable as rows are removed. */
interface LinkRow {
  key: number
  value: string
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
  // Always at least one row, so the field never vanishes.
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() => {
    const start = initial ? visualLinks(initial) : []
    return (start.length > 0 ? start : [""]).map((value, key) => ({ key, value }))
  })
  const [nextLinkKey, setNextLinkKey] = useState(VISUAL_LINKS_MAX + 1)
  const [submitting, setSubmitting] = useState(false)

  // Same checks the server runs (requestVisualSchema, via parseVisualLinks);
  // the inline errors just save a round trip. Errors are keyed by row position.
  const links = parseVisualLinks(linkRows.map((r) => r.value))
  const linkErrors = new Map<number, string>()
  if (!links.ok) for (const e of links.errors) if (e.index !== null) linkErrors.set(e.index, e.message)
  const listError = !links.ok ? links.errors.find((e) => e.index === null)?.message : undefined
  const hasDescription = description.trim() !== ""
  const canSubmit = sessionStatus === "authenticated" && !unlinked && hasDescription && links.ok && !submitting

  function setLink(index: number, value: string) {
    setLinkRows((rows) => rows.map((r, i) => (i === index ? { ...r, value } : r)))
  }
  function addLink() {
    if (linkRows.length >= VISUAL_LINKS_MAX) return
    setLinkRows((rows) => [...rows, { key: nextLinkKey, value: "" }])
    setNextLinkKey((k) => k + 1)
  }
  function removeLink(index: number) {
    // Removing the only row empties it instead.
    setLinkRows((rows) => (rows.length === 1 ? [{ ...rows[0], value: "" }] : rows.filter((_, i) => i !== index)))
  }

  // Only the standalone page: the inline story form sits inside a page that
  // has its own guards, and a reload there loses little.
  const [saved, setSaved] = useState(false)
  const dirty =
    [description, location, notes, ...linkRows.map((r) => r.value)].some((v) => v.trim() !== "") ||
    eventDateTime !== null ||
    deadline !== null
  useUnsavedChangesWarning(standalone && dirty && !saved, "Leave this page? Your visual request hasn't been filed yet.")

  async function handleSubmit() {
    if (!canSubmit || !links.ok) return
    setSubmitting(true)
    try {
      let res: Response
      if (editing) {
        // Every field, with null clearing what was emptied. `links` is the whole
        // list ([] clears it); the server also clears the legacy dataUrl.
        const body = {
          type,
          priority,
          description: description.trim(),
          eventDateTime,
          location: location.trim() || null,
          deadline,
          notes: notes.trim() || null,
          links: links.value,
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
        if (links.value.length > 0) body.links = links.value
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

      <fieldset className="space-y-1.5" aria-describedby="vr-links-hint">
        <legend className="text-sm font-medium leading-none">Links</legend>
        <p id="vr-links-hint" className="text-xs text-muted-foreground">
          Share links to data, files or references. Make sure the visuals desk can open them.
        </p>
        {linkRows.map((row, index) => {
          const error = linkErrors.get(index)
          const errorId = `vr-link-${row.key}-error`
          return (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  type="url"
                  inputMode="url"
                  className="h-8"
                  autoComplete="off"
                  placeholder="https://"
                  aria-label={`Link ${index + 1}`}
                  value={row.value}
                  onChange={(e) => setLink(index, e.target.value)}
                  aria-invalid={error !== undefined}
                  aria-describedby={error ? errorId : undefined}
                />
                {(linkRows.length > 1 || row.value !== "") && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeLink(index)}
                    aria-label={`Remove link ${index + 1}`}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>
              {error && (
                <p id={errorId} className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          )
        })}
        {listError && <p className="text-xs text-destructive">{listError}</p>}
        {linkRows.length < VISUAL_LINKS_MAX ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={addLink}>
            <Plus className="size-3" />
            Add another
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Up to {VISUAL_LINKS_MAX} links.</p>
        )}
      </fieldset>

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
