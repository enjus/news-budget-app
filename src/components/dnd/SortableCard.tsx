"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

interface SortableCardProps {
  id: string
  children: React.ReactNode
  /** When true, only the grip handle activates drag; the rest of the card is a tap target. */
  handle?: boolean
}

export function SortableCard({ id, children, handle }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  if (handle) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="flex items-start gap-1">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          tabIndex={-1}
          aria-label="Drag to reorder"
          className="touch-none mt-1 shrink-0 cursor-grab active:cursor-grabbing rounded text-muted-foreground/40 hover:text-muted-foreground/70 p-2 -m-2 md:p-0 md:m-0"
        >
          <GripVertical className="size-5 md:size-3" />
        </button>
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
