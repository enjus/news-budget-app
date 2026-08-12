"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ChevronDown, Pencil, Trash2, UserCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { PersonForm } from "./PersonForm"
import { usePeople } from "@/lib/hooks/usePeople"
import { PERSON_ROLE_LABELS, hasAdminAccess, cn } from "@/lib/utils"
import type { PersonWithCounts } from "@/types/index"
import { apiPath } from "@/lib/api-path"

export function PersonList() {
  const { data: session } = useSession()
  const isAdmin = hasAdminAccess(session?.user?.appRole ?? "")
  const { people, isLoading, mutate } = usePeople({ activeOnly: false })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [inactiveExpanded, setInactiveExpanded] = useState(false)

  async function handleDelete(person: PersonWithCounts) {
    setDeletingId(person.id)
    try {
      const res = await fetch(apiPath(`/api/people/${person.id}`), { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Delete failed (${res.status})`)
      }
      toast.success(`${person.name} deleted`)
      mutate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete person")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleActive(person: PersonWithCounts) {
    setTogglingId(person.id)
    try {
      const res = await fetch(apiPath(`/api/people/${person.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !person.isActive }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success(person.isActive ? `${person.name} marked inactive` : `${person.name} marked active`)
      mutate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTogglingId(null)
    }
  }

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
            {person.name}
          </Link>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{person.email ?? "—"}</td>
        <td className="px-4 py-3">{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</td>
        <td className="px-4 py-3">{count}</td>
        <td className="px-4 py-3">
          {person.isActive ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {/* Active/inactive toggle — admins only */}
            {isAdmin && (
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={togglingId === person.id}
                onClick={() => handleToggleActive(person)}
                aria-label={person.isActive ? "Mark inactive" : "Mark active"}
                title={person.isActive ? "Mark inactive" : "Mark active"}
              >
                {person.isActive ? (
                  <UserX className="size-4" />
                ) : (
                  <UserCheck className="size-4" />
                )}
              </Button>
            )}

            {/* Edit */}
            <PersonForm
              person={person}
              onSuccess={() => mutate()}
              trigger={
                <Button size="icon-sm" variant="ghost" aria-label="Edit person">
                  <Pencil className="size-4" />
                </Button>
              }
            />

            {/* Delete */}
            {count > 0 ? (
              <Button
                size="icon-sm"
                variant="ghost"
                disabled
                title={`Cannot delete: has ${count} assignment${count !== 1 ? "s" : ""}`}
                className="cursor-not-allowed opacity-40"
                aria-label="Cannot delete — person has assignments"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={deletingId === person.id}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete person"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {person.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete this person.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => handleDelete(person)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const activePeople = people.filter((p) => p.isActive)
  const inactivePeople = people.filter((p) => !p.isActive)

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
      {activePeople.length > 0 ? (
        renderTable(activePeople)
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">No active people. Add your first team member.</p>
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
