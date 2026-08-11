"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PersonBadge } from "@/components/people/PersonBadge"
import {
  VisualDraftRow,
  VISUAL_TYPE_LABELS,
  visualDraftToBody,
  type VisualDraft,
  type VisualTypeValue,
} from "./VisualDraftRow"
import type { VisualWithPerson } from "@/types/index"
import type { Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"

interface VisualSectionProps {
  storyId: string
  visuals: VisualWithPerson[]
  onUpdate: () => void
  readOnly?: boolean
}

export function VisualSection({ storyId, visuals, onUpdate, readOnly }: VisualSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleEdit(visualId: string, draft: VisualDraft) {
    setIsSaving(true)
    try {
      // PATCH is a partial update, so description and personId are sent
      // explicitly as null when cleared — omitting them would leave the old
      // value in place instead of removing it.
      const res = await fetch(apiPath(`/api/visuals/${visualId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          description: draft.description || null,
          personId: draft.person?.id ?? null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to save visual (${res.status})`)
      }
      toast.success("Visual updated")
      setEditingId(null)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save visual")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAdd(draft: VisualDraft) {
    setIsAdding(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${storyId}/visuals`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visualDraftToBody(draft)),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add visual (${res.status})`)
      }
      toast.success("Visual added")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add visual")
    } finally {
      setIsAdding(false)
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
          {visuals.map((visual) =>
            editingId === visual.id ? (
              <VisualDraftRow
                key={visual.id}
                initial={{
                  type: visual.type as VisualTypeValue,
                  description: visual.description ?? "",
                  person: (visual.person as Person) ?? null,
                }}
                onSubmit={(draft) => handleEdit(visual.id, draft)}
                onCancel={() => setEditingId(null)}
                busy={isSaving}
              />
            ) : (
            <div
              key={visual.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <Badge
                variant={visual.type === "PHOTO" ? "default" : "secondary"}
                className="shrink-0"
              >
                {VISUAL_TYPE_LABELS[visual.type as VisualTypeValue] ?? visual.type}
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
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setEditingId(visual.id)}
                    aria-label="Edit visual"
                  >
                    <Pencil className="size-3" />
                  </Button>
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
                </span>
              )}
            </div>
            )
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No visuals yet.</p>
      )}

      {/* Add new visual */}
      {!readOnly && <VisualDraftRow onSubmit={handleAdd} busy={isAdding} />}
    </div>
  )
}
