"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PersonBadge } from "@/components/people/PersonBadge"
import { PersonPicker, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import { PERSON_ROLE_LABELS, toAssignmentRole, displayName } from "@/lib/utils"
import type { AssignmentWithPerson, VideoAssignmentWithPerson, Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"

interface AssignmentSectionProps {
  /** Which parent this section is attached to — determines the API path
   *  (/api/stories/:id/assignments vs /api/videos/:id/assignments). Story
   *  and video assignments share the same AssignmentRoleEnum, so everything
   *  else about the two is identical. */
  parentType: "story" | "video"
  parentId: string
  assignments: AssignmentWithPerson[] | VideoAssignmentWithPerson[]
  onUpdate: () => void
  readOnly?: boolean
  /** Video assignments lead with Videographer instead of Reporter. */
  roles?: AssignmentRoleValue[]
  defaultRole?: AssignmentRoleValue
}

export function AssignmentSection({
  parentType,
  parentId,
  assignments,
  onUpdate,
  readOnly,
  roles,
  defaultRole,
}: AssignmentSectionProps) {
  const { data: session } = useSession()
  const [isAdding, setIsAdding] = useState(false)

  const assignmentsPath = apiPath(`/api/${parentType}s/${parentId}/assignments`)

  async function handleAdd(person: Person, role: AssignmentRoleValue) {
    setIsAdding(true)
    try {
      const res = await fetch(assignmentsPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, role }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add assignment (${res.status})`)
      }
      toast.success(`${displayName(person.name)} added as ${PERSON_ROLE_LABELS[role] ?? role}`)
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
      const res = await fetch(`${assignmentsPath}?${params}`, {
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

  const myPersonId = session?.user?.personId
  const myDefaultRole = session?.user?.personDefaultRole
  const alreadyAssignedMe = myPersonId ? assignedIds.includes(myPersonId) : true

  async function handleAddMe() {
    if (!myPersonId || !myDefaultRole) return
    setIsAdding(true)
    try {
      const role = toAssignmentRole(myDefaultRole) as AssignmentRoleValue
      const res = await fetch(assignmentsPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: myPersonId, role }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to add assignment (${res.status})`)
      }
      toast.success(`Added you as ${PERSON_ROLE_LABELS[role] ?? role}`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add assignment")
    } finally {
      setIsAdding(false)
    }
  }

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
        <div className="flex items-center gap-2">
          <PersonPicker
            onSelect={handleAdd}
            excludeIds={assignedIds}
            roles={roles}
            defaultRole={defaultRole}
            label={isAdding ? "Adding..." : "Add person"}
          />
          {myPersonId && myDefaultRole && !alreadyAssignedMe && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAdding}
              onClick={handleAddMe}
            >
              <UserPlus className="size-3.5 mr-1.5" />
              Add me
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
