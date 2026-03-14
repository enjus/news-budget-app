"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PersonBadge } from "@/components/people/PersonBadge"
import { PersonPicker, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import { PERSON_ROLE_LABELS } from "@/lib/utils"
import type { VideoAssignmentWithPerson } from "@/types/index"
import type { Person } from "@/types/index"

interface VideoAssignmentSectionProps {
  videoId: string
  assignments: VideoAssignmentWithPerson[]
  onUpdate: () => void
  readOnly?: boolean
}

export function VideoAssignmentSection({
  videoId,
  assignments,
  onUpdate,
  readOnly,
}: VideoAssignmentSectionProps) {
  const [isAdding, setIsAdding] = useState(false)

  async function handleAdd(person: Person, role: AssignmentRoleValue) {
    setIsAdding(true)
    try {
      const res = await fetch(`/api/videos/${videoId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, role }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add assignment (${res.status})`)
      }
      toast.success(`${person.name} added as ${PERSON_ROLE_LABELS[role] ?? role}`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add assignment")
    } finally {
      setIsAdding(false)
    }
  }

  async function handleRemove(personId: string, role: string) {
    try {
      const params = new URLSearchParams({ personId, role })
      const res = await fetch(`/api/videos/${videoId}/assignments?${params}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to remove assignment (${res.status})`)
      }
      toast.success("Assignment removed")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove assignment")
    }
  }

  const assignedIds = assignments.map((a) => a.person.id)

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Assignments
      </h3>

      {assignments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {assignments.map((assignment) => (
            <PersonBadge
              key={`${assignment.personId}-${assignment.role}`}
              person={assignment.person}
              role={PERSON_ROLE_LABELS[assignment.role] ?? assignment.role}
              onRemove={readOnly ? undefined : () => handleRemove(assignment.personId, assignment.role)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No assignments yet.</p>
      )}

      {!readOnly && (
        <PersonPicker
          onSelect={handleAdd}
          excludeIds={assignedIds}
          roles={["VIDEOGRAPHER", "REPORTER", "EDITOR", "OTHER"]}
          defaultRole="VIDEOGRAPHER"
          label={isAdding ? "Adding..." : "Add person"}
        />
      )}
    </div>
  )
}
