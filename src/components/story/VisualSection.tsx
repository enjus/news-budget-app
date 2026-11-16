"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ExternalLink, Plus, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PersonBadge } from "@/components/people/PersonBadge"
import { PersonSelect } from "@/components/people/PersonSelect"
import { usePeople } from "@/lib/hooks/usePeople"
import type { VisualWithPerson } from "@/types/index"
import type { Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"
import { VISUAL_TYPE_LABELS, type VisualTypeValue } from "@/lib/visual-types"
import { VISUAL_REQUESTS_ENABLED } from "@/lib/features"
import { VISUAL_STATUS_LABELS, isVisualStatus } from "@/lib/visual-statuses"
import { canActOnVisual, parseDataUrl } from "@/lib/visual-requests"
import { formatPubDate } from "@/lib/utils"
import { VisualRequestForm } from "./VisualRequestForm"

// Re-exported: StoryForm imports these from here.
export { VISUAL_TYPE_LABELS, type VisualTypeValue }

export interface NewVisual {
  type: VisualTypeValue
  description: string
  person: Person | null
}

/** Body for POST /api/stories/[id]/visuals — shared with StoryForm's create-mode post. */
export function visualRequestBody(visual: NewVisual): Record<string, unknown> {
  const body: Record<string, unknown> = { type: visual.type }
  if (visual.description.trim()) body.description = visual.description.trim()
  if (visual.person) body.personId = visual.person.id
  return body
}

/**
 * The type / description / person row for adding a visual. Used live by
 * VisualSection (edit view) and as a pending list by StoryForm (create view,
 * where no story id exists yet). `onAdd` resolves false to keep the inputs.
 */
export function VisualAddRow({ onAdd }: { onAdd: (visual: NewVisual) => Promise<boolean> | boolean }) {
  const [isAdding, setIsAdding] = useState(false)
  const [newType, setNewType] = useState<VisualTypeValue>("PHOTO")
  const [newDescription, setNewDescription] = useState("")
  const [newPersonId, setNewPersonId] = useState<string>("")

  const { people } = usePeople()

  async function handleAdd() {
    setIsAdding(true)
    try {
      const person = people.find((p) => p.id === newPersonId) ?? null
      const ok = await onAdd({ type: newType, description: newDescription, person })
      if (ok) {
        setNewDescription("")
        setNewPersonId("")
        setNewType("PHOTO")
      }
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
      <Select value={newType} onValueChange={(v) => setNewType(v as VisualTypeValue)}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PHOTO">Photo</SelectItem>
          <SelectItem value="GRAPHIC">Graphic</SelectItem>
          <SelectItem value="MAP">Map</SelectItem>
          <SelectItem value="VIDEO">Video</SelectItem>
        </SelectContent>
      </Select>

      <Input
        className="h-8 flex-1 min-w-[160px]"
        placeholder="Description (optional)"
        value={newDescription}
        onChange={(e) => setNewDescription(e.target.value)}
        onKeyDown={(e) => {
          // In StoryForm's create view this row sits inside the story <form>;
          // Enter should add the visual, not submit the whole story.
          if (e.key === "Enter") {
            e.preventDefault()
            if (!isAdding) handleAdd()
          }
        }}
      />

      <PersonSelect
        value={newPersonId || null}
        onChange={(id) => setNewPersonId(id ?? "")}
        placeholder="Unassigned"
        noneLabel="Unassigned"
        className="h-8 w-[180px]"
      />

      <Button
        type="button"
        size="sm"
        onClick={handleAdd}
        disabled={isAdding}
      >
        <Plus className="size-4" />
        {isAdding ? "Adding..." : "Add Visual"}
      </Button>
    </div>
  )
}

interface VisualSectionProps {
  storyId: string
  visuals: VisualWithPerson[]
  onUpdate: () => void
  readOnly?: boolean
  /** Story fields the Request form prefills from. */
  budgetLine?: string
  onlinePubDate?: string | Date | null
  onlinePubDateTBD?: boolean
}

type StatusVariant = "default" | "secondary" | "destructive" | "outline"

// PLANNED shows no badge (it looks as it always did); the rest of the lifecycle does.
const STATUS_BADGE_VARIANT: Record<string, StatusVariant> = {
  REQUESTED: "outline",
  ASSIGNED: "secondary",
  IN_PROGRESS: "secondary",
  DELIVERED: "default",
  DECLINED: "destructive",
  CANCELED: "outline",
}

export function VisualSection({
  storyId,
  visuals,
  onUpdate,
  readOnly,
  budgetLine,
  onlinePubDate,
  onlinePubDateTBD,
}: VisualSectionProps) {
  const { data: session } = useSession()
  const [isRequesting, setIsRequesting] = useState(false)

  async function handleAdd(visual: NewVisual): Promise<boolean> {
    try {
      const res = await fetch(apiPath(`/api/stories/${storyId}/visuals`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visualRequestBody(visual)),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add visual (${res.status})`)
      }
      toast.success("Visual added")
      onUpdate()
      return true
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add visual")
      return false
    }
  }

  async function handleRemove(visualId: string) {
    try {
      const res = await fetch(apiPath(`/api/visuals/${visualId}`), { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to remove visual (${res.status})`)
      }
      toast.success("Visual removed")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove visual")
    }
  }

  // Hide the remove button when the server would refuse it (requests: admin + finished only).
  const actor = session?.user ? { role: session.user.appRole, personId: session.user.personId ?? null } : null
  function canRemove(visual: VisualWithPerson): boolean {
    return actor !== null && canActOnVisual(actor, visual, "delete")
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Visuals
      </h3>

      {/* Existing visuals */}
      {visuals.length > 0 ? (
        <div className="space-y-2">
          {visuals.map((visual) => {
            const isRequest = visual.status !== "PLANNED"
            // Re-validated before rendering as an href, whatever the database holds.
            const link = visual.dataUrl ? parseDataUrl(visual.dataUrl) : null
            const details = [
              visual.location,
              visual.eventDateTime && `Event ${formatPubDate(visual.eventDateTime, false)}`,
              visual.deadline && `Needed by ${formatPubDate(visual.deadline, false)}`,
            ].filter(Boolean)

            return (
              <div
                key={visual.id}
                className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={visual.type === "PHOTO" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {VISUAL_TYPE_LABELS[visual.type as VisualTypeValue] ?? "Graphic"}
                  </Badge>

                  {isRequest && (
                    <Badge variant={STATUS_BADGE_VARIANT[visual.status] ?? "outline"} className="shrink-0">
                      {isVisualStatus(visual.status) ? VISUAL_STATUS_LABELS[visual.status] : visual.status}
                    </Badge>
                  )}
                  {isRequest && visual.priority === "URGENT" && (
                    <Badge variant="destructive" className="shrink-0">Urgent</Badge>
                  )}

                  {visual.description && (
                    <span className="flex-1 text-sm text-muted-foreground truncate">
                      {visual.description}
                    </span>
                  )}

                  {link?.ok && link.value && (
                    <a
                      href={link.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Data <ExternalLink className="size-3" />
                    </a>
                  )}

                  {visual.person ? (
                    <PersonBadge person={visual.person as Person} />
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground italic">Unassigned</span>
                  )}

                  {!readOnly && canRemove(visual) && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleRemove(visual.id)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove visual"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>

                {isRequest && details.length > 0 && (
                  <p className="text-xs text-muted-foreground">{details.join(" · ")}</p>
                )}
                {visual.status === "DECLINED" && visual.declineReason && (
                  <p className="text-xs text-muted-foreground">Declined: {visual.declineReason}</p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No visuals yet.</p>
      )}

      {/* Add new visual */}
      {!readOnly && <VisualAddRow onAdd={handleAdd} />}

      {/* Request a visual from the desk (dark-launched) */}
      {!readOnly && VISUAL_REQUESTS_ENABLED &&
        (isRequesting ? (
          <VisualRequestForm
            storyId={storyId}
            budgetLine={budgetLine}
            defaultDeadline={onlinePubDateTBD || !onlinePubDate ? null : typeof onlinePubDate === "string" ? onlinePubDate : onlinePubDate.toISOString()}
            onSubmitted={() => {
              setIsRequesting(false)
              onUpdate()
            }}
            onCancel={() => setIsRequesting(false)}
          />
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsRequesting(true)}>
            <Send className="size-4" />
            Request a visual
          </Button>
        ))}
    </div>
  )
}
