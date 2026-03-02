"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { PERSON_ROLE_LABELS } from "@/lib/utils"
import type { PersonWithCounts } from "@/types/index"

export function PersonList() {
  const { people, isLoading, mutate } = usePeople()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(person: PersonWithCounts) {
    setDeletingId(person.id)
    try {
      const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" })
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

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Default Role</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assignments</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((person) => {
            const count = totalAssignments(person)
            return (
              <tr key={person.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{person.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{person.email}</td>
                <td className="px-4 py-3">{PERSON_ROLE_LABELS[person.defaultRole] ?? person.defaultRole}</td>
                <td className="px-4 py-3">{count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
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
          })}
        </tbody>
      </table>
    </div>
  )
}
