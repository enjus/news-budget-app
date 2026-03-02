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
import { usePeople } from "@/lib/hooks/usePeople"
import type { VisualWithPerson } from "@/types/index"
import type { Person } from "@/types/index"

interface VisualSectionProps {
  storyId: string
  visuals: VisualWithPerson[]
  onUpdate: () => void
}

export function VisualSection({ storyId, visuals, onUpdate }: VisualSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newType, setNewType] = useState<"PHOTO" | "GRAPHIC">("PHOTO")
  const [newDescription, setNewDescription] = useState("")
  const [newPersonId, setNewPersonId] = useState<string>("")

  const { people } = usePeople()

  async function handleAdd() {
    setIsAdding(true)
    try {
      const body: Record<string, unknown> = { type: newType }
      if (newDescription.trim()) body.description = newDescription.trim()
      if (newPersonId) body.personId = newPersonId

      const res = await fetch(`/api/stories/${storyId}/visuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add visual (${res.status})`)
      }
      toast.success("Visual added")
      setNewDescription("")
      setNewPersonId("")
      setNewType("PHOTO")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add visual")
    } finally {
      setIsAdding(false)
    }
  }

  async function handleRemove(visualId: string) {
    try {
      const res = await fetch(`/api/visuals/${visualId}`, { method: "DELETE" })
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
              <Badge variant={visual.type === "PHOTO" ? "default" : "secondary"} className="shrink-0">
                {visual.type === "PHOTO" ? "Photo" : "Graphic"}
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
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No visuals yet.</p>
      )}

      {/* Add new visual */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
        <Select value={newType} onValueChange={(v) => setNewType(v as "PHOTO" | "GRAPHIC")}>
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PHOTO">Photo</SelectItem>
            <SelectItem value="GRAPHIC">Graphic</SelectItem>
          </SelectContent>
        </Select>

        <Input
          className="h-8 flex-1 min-w-[160px]"
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />

        <Select
          value={newPersonId || "__none__"}
          onValueChange={(v) => setNewPersonId(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Assign person (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
    </div>
  )
}
