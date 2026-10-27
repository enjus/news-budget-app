"use client"

import { cn } from "@/lib/utils"

// The Staff / Contributors / Everyone toggle shared by /roster and /roster/map.

export type StaffFilterValue = "staff" | "contributors" | "all"

const LABELS: Record<StaffFilterValue, string> = {
  staff: "Staff",
  contributors: "Contributors",
  all: "Everyone",
}

export function matchesStaffFilter(person: { isStaff: boolean }, filter: StaffFilterValue) {
  return filter === "all" || person.isStaff === (filter === "staff")
}

export function StaffFilter({
  value,
  onChange,
}: {
  value: StaffFilterValue
  onChange: (value: StaffFilterValue) => void
}) {
  return (
    <div className="flex w-fit overflow-hidden rounded-md border text-sm">
      {(Object.keys(LABELS) as StaffFilterValue[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            "px-3 py-1 transition-colors",
            value === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          {LABELS[f]}
        </button>
      ))}
    </div>
  )
}
