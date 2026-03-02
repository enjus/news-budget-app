"use client"

import { X } from "lucide-react"
import { cn, initials } from "@/lib/utils"
import type { Person } from "@/types/index"

interface PersonBadgeProps {
  person: Person
  onRemove?: () => void
  role?: string
  className?: string
}

export function PersonBadge({ person, onRemove, role, className }: PersonBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground",
        className
      )}
    >
      {/* Initials avatar */}
      <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {initials(person.name)}
      </span>

      <span className="flex flex-col leading-none">
        <span className="text-xs font-medium">{person.name}</span>
        {role && (
          <span className="text-[10px] text-muted-foreground">{role}</span>
        )}
      </span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 flex-shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          aria-label={`Remove ${person.name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
