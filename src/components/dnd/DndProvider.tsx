"use client"

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"

interface DndProviderProps {
  onDragEnd: (event: DragEndEvent) => void
  children: React.ReactNode
  overlayContent?: React.ReactNode
}

export function DndProvider({ onDragEnd, children, overlayContent }: DndProviderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {children}
      <DragOverlay>{overlayContent ?? null}</DragOverlay>
    </DndContext>
  )
}
