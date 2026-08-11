"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePeople } from "@/lib/hooks/usePeople"
import type { Person } from "@/types/index"

export type VisualTypeValue = "PHOTO" | "GRAPHIC" | "MAP" | "VIDEO"

export const VISUAL_TYPE_LABELS: Record<VisualTypeValue, string> = {
  PHOTO: "Photo",
  GRAPHIC: "Graphic",
  MAP: "Map",
  VIDEO: "Video",
}

/**
 * One visual as composed in the UI, before it has an id. The person is passed
 * as the whole object rather than an id so a caller holding it in local state
 * (story create, where there's nothing to POST to yet) can render a name
 * without a second lookup.
 */
export interface VisualDraft {
  type: VisualTypeValue
  description: string
  person: Person | null
}

/**
 * Draft → POST body for /api/stories/[id]/visuals. Empty description and
 * "unassigned" are omitted rather than sent as empty strings, which the Zod
 * schema rejects. Shared so create and edit build an identical body.
 */
export function visualDraftToBody(draft: VisualDraft): Record<string, unknown> {
  const body: Record<string, unknown> = { type: draft.type }
  if (draft.description) body.description = draft.description
  if (draft.person) body.personId = draft.person.id
  return body
}

interface VisualDraftRowProps {
  /** Returning a promise keeps the row disabled until it settles. */
  onAdd: (draft: VisualDraft) => void | Promise<void>
  busy?: boolean
}

/**
 * The "add a visual" controls, shared by the story detail page (where adding
 * POSTs immediately) and the create form (where visuals are held in state
 * until the story exists).
 */
export function VisualDraftRow({ onAdd, busy }: VisualDraftRowProps) {
  const [type, setType] = useState<VisualTypeValue>("PHOTO")
  const [description, setDescription] = useState("")
  const [personId, setPersonId] = useState<string>("")

  const { people } = usePeople()

  async function handleAdd() {
    await onAdd({
      type,
      description: description.trim(),
      person: people.find((p) => p.id === personId) ?? null,
    })
    setType("PHOTO")
    setDescription("")
    setPersonId("")
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
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

      <Input
        className="h-8 flex-1 min-w-[160px]"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Select
        value={personId || "__none__"}
        onValueChange={(v) => setPersonId(v === "__none__" ? "" : v)}
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

      <Button type="button" size="sm" onClick={handleAdd} disabled={busy}>
        <Plus className="size-4" />
        {busy ? "Adding..." : "Add Visual"}
      </Button>
    </div>
  )
}
