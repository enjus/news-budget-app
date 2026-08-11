"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PersonBadge } from "@/components/people/PersonBadge"
import {
  PersonPicker,
  ROLE_LABELS,
  type AssignmentRoleValue,
} from "@/components/people/PersonPicker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PERSON_ROLE_LABELS, toVideoAssignmentRole } from "@/lib/utils"
import type { VideoAssignmentWithPerson } from "@/types/index"
import type { Person } from "@/types/index"
import { apiPath } from "@/lib/api-path"

// Videographer first, matching the PersonPicker ordering and default below.
const VIDEO_ROLES: AssignmentRoleValue[] = ["VIDEOGRAPHER", "REPORTER", "EDITOR", "OTHER"]

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
  const { data: session } = useSession()
  const [isAdding, setIsAdding] = useState(false)
  // `${personId}-${role}` of the assignment whose role change is in flight.
  const [changingKey, setChangingKey] = useState<string | null>(null)

  async function handleRoleChange(personId: string, fromRole: string, toRole: string) {
    if (fromRole === toRole) return
    setChangingKey(`${personId}-${fromRole}`)
    try {
      const res = await fetch(apiPath(`/api/videos/${videoId}/assignments`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, fromRole, toRole }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to change role (${res.status})`)
      }
      toast.success(`Role changed to ${ROLE_LABELS[toRole as AssignmentRoleValue] ?? toRole}`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change role")
    } finally {
      setChangingKey(null)
    }
  }

  async function handleAdd(person: Person, role: AssignmentRoleValue) {
    setIsAdding(true)
    try {
      const res = await fetch(apiPath(`/api/videos/${videoId}/assignments`), {
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
      const res = await fetch(apiPath(`/api/videos/${videoId}/assignments?${params}`), {
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
      const role = toVideoAssignmentRole(myDefaultRole) as AssignmentRoleValue
      const res = await fetch(apiPath(`/api/videos/${videoId}/assignments`), {
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
          {assignments.map((assignment) => {
            const key = `${assignment.personId}-${assignment.role}`
            // Roles are plain strings in the DB, so tolerate one that isn't in
            // VIDEO_ROLES rather than rendering an empty select over it.
            const roleOptions = VIDEO_ROLES.includes(assignment.role as AssignmentRoleValue)
              ? VIDEO_ROLES
              : [...VIDEO_ROLES, assignment.role as AssignmentRoleValue]

            return (
              <div key={key} className="inline-flex items-center gap-1.5">
                <PersonBadge
                  person={assignment.person}
                  role={readOnly ? PERSON_ROLE_LABELS[assignment.role] ?? assignment.role : undefined}
                  onRemove={readOnly ? undefined : () => handleRemove(assignment.personId, assignment.role)}
                />
                {!readOnly && (
                  <Select
                    value={assignment.role}
                    disabled={changingKey === key}
                    onValueChange={(v) => handleRoleChange(assignment.personId, assignment.role, v)}
                  >
                    <SelectTrigger
                      className="h-8 w-[150px]"
                      aria-label={`Role for ${assignment.person.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r] ?? r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No assignments yet.</p>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <PersonPicker
            onSelect={handleAdd}
            excludeIds={assignedIds}
            roles={["VIDEOGRAPHER", "REPORTER", "EDITOR", "OTHER"]}
            defaultRole="VIDEOGRAPHER"
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
