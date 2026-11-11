"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PersonRoleEnum } from "@/lib/validations"
import { PERSON_ROLE_LABELS } from "@/lib/utils"

/** Default-role picker shared by PersonForm and AddPersonDialog. */
export function PersonRoleSelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: string | undefined
  onChange: (value: string) => void
  invalid?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder="Select a role" />
      </SelectTrigger>
      <SelectContent>
        {PersonRoleEnum.options.map((role) => (
          <SelectItem key={role} value={role}>
            {PERSON_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
