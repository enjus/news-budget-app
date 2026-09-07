"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Pencil, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PersonForm } from "./PersonForm"
import { usePeople } from "@/lib/hooks/usePeople"
import { PERSON_ROLE_LABELS, cn, displayName } from "@/lib/utils"
import type { PersonWithCounts } from "@/types/index"

export function PersonList() {
  const { people, isLoading, mutate } = usePeople({ activeOnly: false })
  const [inactiveExpanded, setInactiveExpanded] = useState(false)
  const [staffOnly, setStaffOnly] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (people.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">No people yet. Add your first team member.</p>
      </div>
    )
  }

  function totalAssignments(person: PersonWithCounts) {
    return (person._count?.assignments ?? 0) + (person._count?.videoAssignments ?? 0)
  }

  function renderRow(person: PersonWithCounts) {
    const count = totalAssignments(person)
    return (
      <tr
        key={person.id}
        className={`hover:bg-muted/30 transition-colors ${!person.isActive ? "text-muted-foreground" : ""}`}
      >
        <td className="px-4 py-3 font-medium">
          <Link href={`/people/${person.id}`} className="hover:underline">
            {displayName(person.name)}
          </Link>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{person.email ?? "—"}</td>
        <td className="px-4 py-3">{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</td>
        <td className="px-4 py-3">{count}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {person.isActive ? (
              <Badge variant="secondary">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Inactive
              </Badge>
            )}
            {person.isStaff && <Badge variant="outline">Staff</Badge>}
            {person.isStaff && person.isActive && !person.user && (
              <TriangleAlert className="size-3.5 text-muted-foreground" aria-label="No linked account" />
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {/* Edit — staff/active toggles and delete live inside the modal now;
                they're rarely-used actions and don't need to be always-visible
                row icons. */}
            <PersonForm
              person={person}
              onSuccess={() => mutate()}
              trigger={
                <Button size="icon-sm" variant="ghost" aria-label="Edit person">
                  <Pencil className="size-4" />
                </Button>
              }
            />
          </div>
        </td>
      </tr>
    )
  }

  const scopedPeople = staffOnly ? people.filter((p) => p.isStaff) : people
  const activePeople = scopedPeople.filter((p) => p.isActive)
  const inactivePeople = scopedPeople.filter((p) => !p.isActive)

  function renderTable(rows: PersonWithCounts[]) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Default Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assignments</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">{rows.map(renderRow)}</tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex rounded-md border text-sm overflow-hidden w-fit">
        {([false, true] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => setStaffOnly(v)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              staffOnly === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {v ? "Staff only" : "All"}
          </button>
        ))}
      </div>

      {activePeople.length > 0 ? (
        renderTable(activePeople)
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {staffOnly ? "No staff people match." : "No active people. Add your first team member."}
          </p>
        </div>
      )}

      {inactivePeople.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setInactiveExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("size-4 transition-transform", inactiveExpanded && "rotate-180")} />
            <span className="font-medium">Inactive</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {inactivePeople.length}
            </span>
          </button>

          {inactiveExpanded && renderTable(inactivePeople)}
        </div>
      )}
    </div>
  )
}
