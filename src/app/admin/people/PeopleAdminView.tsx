"use client"

import { Plus } from "lucide-react"
import { PersonList } from "@/components/people/PersonList"
import { AddPersonDialog } from "@/components/people/AddPersonDialog"
import { Button } from "@/components/ui/button"
import { usePeople } from "@/lib/hooks/usePeople"

/** Record management for every Person: work email, default role, staff and
 *  active status, work week, delete. The newsroom-facing list is /roster. */
export function PeopleAdminView() {
  const { mutate } = usePeople({ activeOnly: false })

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Staff and contributor records. Profiles and contact details are on the roster.
          </p>
        </div>
        <div className="flex gap-2">
          <AddPersonDialog
            kind="contributor"
            onCreated={() => void mutate()}
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="size-4" />
                Add contributor
              </Button>
            }
          />
          <AddPersonDialog
            kind="staff"
            onCreated={() => void mutate()}
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                Add staff
              </Button>
            }
          />
        </div>
      </div>

      <PersonList />
    </div>
  )
}
