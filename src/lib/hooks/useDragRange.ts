import { useEffect, useRef, useState } from "react"

/** An in-progress drag across one row of cells: `key` identifies the row
 *  (a week index on the month calendar, a person on the team grid), and
 *  `start`/`end` are cell indexes within it, in drag order. */
export interface DragRange<K> {
  key: K
  start: number
  end: number
}

/**
 * Drag-to-select across a row of cells, shared by MonthCalendar and the team
 * grid. A plain click is a one-cell drag, so `onCommit` handles both.
 *
 * - The live drag is mirrored in a ref, updated synchronously by the mouse
 *   handlers. The window `mouseup` listener reads that ref, never state from
 *   a past render: mouseenter is a continuous-priority event, so its re-render
 *   (and any effect re-subscribing the listener) can still be pending when a
 *   fast release arrives, which used to drop the last cell(s).
 * - `onCommit` runs from the event handler, never inside a setState updater
 *   (updaters run during render; setting another component's state from one
 *   is React's "Cannot update a component while rendering…" error).
 * - A drag is cancelled, without committing, when the window loses focus or
 *   the pointer re-enters a cell with no button held — the release happened
 *   outside the window, where no `mouseup` reached us.
 */
export function useDragRange<K>(onCommit: (range: DragRange<K>) => void) {
  const [drag, setDrag] = useState<DragRange<K> | null>(null)
  const dragRef = useRef<DragRange<K> | null>(null)
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  })

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    function onUp() {
      const range = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (range) commitRef.current(range)
    }
    function onCancel() {
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener("mouseup", onUp)
    window.addEventListener("blur", onCancel)
    return () => {
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("blur", onCancel)
    }
  }, [dragging])

  function update(next: DragRange<K> | null) {
    dragRef.current = next
    setDrag(next)
  }

  /** onMouseDown on a cell. Only the primary button starts a drag. */
  function begin(key: K, index: number, event: { button: number }) {
    if (event.button !== 0) return
    update({ key, start: index, end: index })
  }

  /** onMouseEnter on a cell. Extends a drag within the same row only. */
  function extend(key: K, index: number, event: { buttons: number }) {
    const current = dragRef.current
    if (!current) return
    if ((event.buttons & 1) === 0) {
      update(null)
      return
    }
    if (current.key !== key || current.end === index) return
    update({ ...current, end: index })
  }

  /** The dragged cells of `key`'s row as [low, high], or null. */
  function selectedIn(key: K): [number, number] | null {
    if (!drag || drag.key !== key) return null
    return [Math.min(drag.start, drag.end), Math.max(drag.start, drag.end)]
  }

  return { begin, extend, selectedIn }
}

/** onClick for a drag-selectable cell: acts only on keyboard activation
 *  (Enter/Space report `detail === 0`). Mouse clicks already went through
 *  begin()/mouseup, so handling them here too would open things twice. */
export function onKeyboardActivate(action: () => void) {
  return (event: { detail: number }) => {
    if (event.detail === 0) action()
  }
}
