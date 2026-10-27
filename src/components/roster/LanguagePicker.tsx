"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ROSTER_LANGUAGES } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { LanguageChip } from "./LanguageChip"

interface LanguagePickerProps {
  id?: string
  value: string[]
  onChange: (codes: string[]) => void
}

/** Multi-select of ROSTER_LANGUAGES: searchable list toggles codes, chips remove them. */
export function LanguagePicker({ id, value, onChange }: LanguagePickerProps) {
  const [open, setOpen] = useState(false)

  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <LanguageChip key={code} code={code} onRemove={() => toggle(code)} />
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal sm:w-[240px]"
          >
            Add languages…
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(280px,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search languages..." />
            <CommandList>
              <CommandEmpty>No matching language.</CommandEmpty>
              <CommandGroup>
                {ROSTER_LANGUAGES.map((lang) => (
                  <CommandItem key={lang.code} value={lang.label} onSelect={() => toggle(lang.code)}>
                    <Check
                      className={cn("size-4", value.includes(lang.code) ? "opacity-100" : "opacity-0")}
                    />
                    {lang.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
