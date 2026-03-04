"use client"

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  CollisionDetection,
  rectIntersection,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"

interface DndProviderProps {
  onDragEnd: (event: DragEndEvent) => void
  onDragStart?: (event: DragStartEvent) => void
  children: React.ReactNode
  overlayContent?: React.ReactNode
  collisionDetection?: CollisionDetection
}

export function DndProvider({ onDragEnd, onDragStart, children, overlayContent, collisionDetection }: DndProviderProps) {
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
    <DndContext sensors={sensors} onDragEnd={onDragEnd} onDragStart={onDragStart} collisionDetection={collisionDetection ?? rectIntersection}>
      {children}
      <DragOverlay>{overlayContent ?? null}</DragOverlay>
    </DndContext>
  )
}
