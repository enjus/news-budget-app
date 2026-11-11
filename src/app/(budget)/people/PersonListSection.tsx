"use client"

import { useSession } from "next-auth/react"
import { Plus } from "lucide-react"
import { PersonList } from "@/components/people/PersonList"
import { AddPersonDialog } from "@/components/people/AddPersonDialog"
import { Button } from "@/components/ui/button"
import { usePeople } from "@/lib/hooks/usePeople"
import { canManageRoster } from "@/lib/utils"

export function PersonListSection() {
  const { data: session } = useSession()
  const { mutate } = usePeople({ activeOnly: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">Manage your team members</p>
        </div>
        <div className="flex gap-2">
          <AddPersonDialog
            kind="contributor"
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="size-4" />
                Add contributor
              </Button>
            }
          />
          {canManageRoster(session?.user?.appRole ?? "") && (
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
          )}
        </div>
      </div>

      <PersonList />
    </div>
  )
}
