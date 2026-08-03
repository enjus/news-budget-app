"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
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
import { usePeople } from "@/lib/hooks/usePeople"

interface PersonSelectProps {
  /** Currently selected person id, or null for none. */
  value: string | null
  onChange: (personId: string | null) => void
  /** People to hide from the list (e.g. already linked to another user). */
  excludeIds?: string[]
  /**
   * Display name to fall back to when `value` isn't found in the loaded
   * `usePeople()` page (e.g. the linked person falls outside the API's
   * default 200-result page). Display only — does not affect selection.
   */
  fallbackLabel?: string | null
  placeholder?: string
  id?: string
}

/**
 * Single-select, nullable person combobox for form fields.
 * (PersonPicker is the multi-add variant with a role selector.)
 */
export function PersonSelect({
  value,
  onChange,
  excludeIds = [],
  fallbackLabel,
  placeholder = "No linked person",
  id,
}: PersonSelectProps) {
  const [open, setOpen] = useState(false)
  const { people, isLoading } = usePeople()

  const selectedPerson = people.find((p) => p.id === value) ?? null
  const availablePeople = people.filter(
    (p) => p.id === value || !excludeIds.includes(p.id)
  )
  // selectedPerson can be null even when a link exists, if that person
  // falls outside usePeople()'s loaded page — fall back to the known name.
  const triggerLabel = selectedPerson?.name ?? (value ? fallbackLabel : null) ?? placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people..." />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Loading...</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No people found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__none__ no linked person"
                    onSelect={() => {
                      onChange(null)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn("mr-2 size-4", value === null ? "opacity-100" : "opacity-0")}
                    />
                    <span className="text-sm text-muted-foreground">
                      None (no linked person)
                    </span>
                  </CommandItem>
                  {availablePeople.map((person) => (
                    <CommandItem
                      key={person.id}
                      value={`${person.name} ${person.email}`}
                      onSelect={() => {
                        onChange(person.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          value === person.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{person.name}</span>
                        <span className="text-xs text-muted-foreground">{person.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
