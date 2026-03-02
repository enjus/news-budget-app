"use client"

import { PersonList } from "@/components/people/PersonList"
import { PersonForm } from "@/components/people/PersonForm"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { usePeople } from "@/lib/hooks/usePeople"

export function PersonListSection() {
  const { mutate } = usePeople()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">Manage your team members</p>
        </div>
        <PersonForm
          onSuccess={() => mutate()}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Add Person
            </Button>
          }
        />
      </div>

      <PersonList />
    </div>
  )
}
