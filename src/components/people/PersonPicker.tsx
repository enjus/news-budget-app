"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
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

export type AssignmentRoleValue = "REPORTER" | "EDITOR" | "OTHER"

const ALL_ROLES: AssignmentRoleValue[] = ["REPORTER", "EDITOR", "OTHER"]

const ROLE_LABELS: Record<AssignmentRoleValue, string> = {
  REPORTER: "Reporter",
  EDITOR: "Editor",
  OTHER: "Other",
}

interface PersonPickerProps {
  onSelect: (person: Person, role: AssignmentRoleValue) => void
  excludeIds?: string[]
  roles?: AssignmentRoleValue[]
  label?: string
}

export function PersonPicker({
  onSelect,
  excludeIds = [],
  roles = ALL_ROLES,
  label = "Add person",
}: PersonPickerProps) {
  const [open, setOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedRole, setSelectedRole] = useState<AssignmentRoleValue>("REPORTER")
  const { people, isLoading } = usePeople()

  const filteredPeople = people.filter((p) => !excludeIds.includes(p.id))

  function handleAdd() {
    if (!selectedPerson) return
    onSelect(selectedPerson, selectedRole)
    setSelectedPerson(null)
    setSelectedRole("REPORTER")
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Person combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="min-w-[200px] justify-between"
          >
            {selectedPerson ? selectedPerson.name : label}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
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
                      value={`${person.name} ${person.email}`}
                      onSelect={() => {
                        setSelectedPerson(person)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          selectedPerson?.id === person.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{person.name}</span>
                        <span className="text-xs text-muted-foreground">{person.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Role selector */}
      <Select
        value={selectedRole}
        onValueChange={(v) => setSelectedRole(v as AssignmentRoleValue)}
      >
        <SelectTrigger className="h-8 w-[130px]">
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

      {/* Add button */}
      <Button
        type="button"
        size="sm"
        onClick={handleAdd}
        disabled={!selectedPerson}
      >
        <Plus className="size-4" />
        Add
      </Button>
    </div>
  )
}
