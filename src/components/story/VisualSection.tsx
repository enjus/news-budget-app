"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
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

export type VisualTypeValue = "PHOTO" | "GRAPHIC" | "MAP" | "VIDEO"

export const VISUAL_TYPE_LABELS: Record<VisualTypeValue, string> = {
  PHOTO: "Photo",
  GRAPHIC: "Graphic",
  MAP: "Map",
  VIDEO: "Video",
}

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
}

export function VisualSection({ storyId, visuals, onUpdate, readOnly }: VisualSectionProps) {
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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Visuals
      </h3>

      {/* Existing visuals */}
      {visuals.length > 0 ? (
        <div className="space-y-2">
          {visuals.map((visual) => (
            <div
              key={visual.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <Badge
                variant={visual.type === "PHOTO" ? "default" : "secondary"}
                className="shrink-0"
              >
                {visual.type === "PHOTO" ? "Photo" : visual.type === "MAP" ? "Map" : visual.type === "VIDEO" ? "Video" : "Graphic"}
              </Badge>

              {visual.description && (
                <span className="flex-1 text-sm text-muted-foreground truncate">
                  {visual.description}
                </span>
              )}

              {visual.person ? (
                <PersonBadge person={visual.person as Person} />
              ) : (
                <span className="flex-1 text-xs text-muted-foreground italic">Unassigned</span>
              )}

              {!readOnly && (
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
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No visuals yet.</p>
      )}

      {/* Add new visual */}
      {!readOnly && <VisualAddRow onAdd={handleAdd} />}
    </div>
  )
}
