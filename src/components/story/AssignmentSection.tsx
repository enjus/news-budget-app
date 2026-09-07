"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PersonBadge } from "@/components/people/PersonBadge"
import { PersonPicker, VIDEO_ROLE_PRIORITY, VIDEO_DEFAULT_ROLE, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import { PERSON_ROLE_LABELS, toAssignmentRole, displayName } from "@/lib/utils"
import type { AssignmentWithPerson, VideoAssignmentWithPerson, Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"

// Explicit map, not `${parentType}s` string concatenation — "story" pluralizes
// irregularly ("stories", not "storys") and the real route folder is
// src/app/api/stories/[id]/assignments.
const ASSIGNMENTS_BASE_PATH = {
  story: "/api/stories",
  video: "/api/videos",
} as const

// Video assignments lead with Videographer instead of Reporter; story
// assignments use PersonPicker's own defaults (Reporter first). Keyed by
// parentType here so every call site — read-only or editable — gets it for
// free, rather than each caller repeating the same role list.
const ROLE_CONFIG: Record<
  keyof typeof ASSIGNMENTS_BASE_PATH,
  { roles?: AssignmentRoleValue[]; defaultRole?: AssignmentRoleValue }
> = {
  story: {},
  video: { roles: VIDEO_ROLE_PRIORITY, defaultRole: VIDEO_DEFAULT_ROLE },
}

type AssignmentSectionProps =
  | {
      parentType: "story"
      parentId: string
      assignments: AssignmentWithPerson[]
      onUpdate: () => void
      readOnly?: boolean
    }
  | {
      parentType: "video"
      parentId: string
      assignments: VideoAssignmentWithPerson[]
      onUpdate: () => void
      readOnly?: boolean
    }

export function AssignmentSection({
  parentType,
  parentId,
  assignments,
  onUpdate,
  readOnly,
}: AssignmentSectionProps) {
  const { data: session } = useSession()
  const [isAdding, setIsAdding] = useState(false)
  const { roles, defaultRole } = ROLE_CONFIG[parentType]

  const assignmentsPath = apiPath(`${ASSIGNMENTS_BASE_PATH[parentType]}/${parentId}/assignments`)

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
