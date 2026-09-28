"use client"

import { useState } from "react"
import { ChevronsUpDown, Plus } from "lucide-react"
import { displayName } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePeople } from "@/lib/hooks/usePeople"
import type { Person } from "@/types/index"

export type AssignmentRoleValue = "REPORTER" | "EDITOR" | "VIDEOGRAPHER" | "OTHER"

const ALL_ROLES: AssignmentRoleValue[] = ["REPORTER", "EDITOR", "VIDEOGRAPHER", "OTHER"]

/** Role order/default for video assignment pickers — video assignments lead with
 *  Videographer instead of Reporter. Shared by AssignmentSection (edit-mode,
 *  parentType="video") and VideoForm (create-mode's pending-assignments picker)
 *  so the two can't drift apart. */
export const VIDEO_ROLE_PRIORITY: AssignmentRoleValue[] = ["VIDEOGRAPHER", "REPORTER", "EDITOR", "OTHER"]
export const VIDEO_DEFAULT_ROLE: AssignmentRoleValue = "VIDEOGRAPHER"

const ROLE_LABELS: Record<AssignmentRoleValue, string> = {
  REPORTER: "Reporter",
  EDITOR: "Editor",
  VIDEOGRAPHER: "Videographer",
  OTHER: "Other",
}

interface PersonPickerProps {
  onSelect: (person: Person, role: AssignmentRoleValue) => void
  excludeIds?: string[]
  roles?: AssignmentRoleValue[]
  defaultRole?: AssignmentRoleValue
  label?: string
}

/**
 * Role first, then name: picking a name adds that person immediately with the
 * role showing. There's deliberately no separate "Add" step — people kept
 * choosing a name and moving on (or hitting Create/Save), assuming it was
 * added. A mis-pick is undone with the resulting chip's remove button.
 */
export function PersonPicker({
  onSelect,
  excludeIds = [],
  roles = ALL_ROLES,
  defaultRole = "REPORTER",
  label = "Add person",
}: PersonPickerProps) {
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<AssignmentRoleValue>(defaultRole)
  const { people, isLoading } = usePeople()

  const filteredPeople = people.filter((p) => !excludeIds.includes(p.id))

  function handlePick(person: Person) {
    onSelect(person, selectedRole)
    setSelectedRole(defaultRole)
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Role selector — chosen before the name, since picking the name adds */}
      <Select
        value={selectedRole}
        onValueChange={(v) => setSelectedRole(v as AssignmentRoleValue)}
      >
        <SelectTrigger className="h-8 w-[130px]" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Person combobox — selecting a name adds them */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="min-w-[200px] justify-between font-normal"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3.5" />
              {label}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(280px,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search people..." />
            <CommandList>
              {isLoading ? (
                <CommandEmpty>Loading...</CommandEmpty>
              ) : filteredPeople.length === 0 ? (
                <CommandEmpty>No people found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredPeople.map((person) => (
                    <CommandItem
                      key={person.id}
                      value={`${displayName(person.name)}${person.email ? ` ${person.email}` : ""}`}
                      onSelect={() => handlePick(person)}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{displayName(person.name)}</span>
                        {person.email && (
                          <span className="text-xs text-muted-foreground">{person.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
