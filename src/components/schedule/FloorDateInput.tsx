"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SCHEDULE_START_DATE, clampToScheduleStart, isBeforeScheduleStart } from "@/lib/schedule"

interface FloorDateInputProps {
  value: string
  /** Called with a date that's never before the schedule start (issue #85). */
  onCommit: (value: string) => void
  id?: string
  className?: string
  "aria-label"?: string
}

/** A date input that clamps to the schedule start on commit rather than on
 *  every keystroke. Clamping in onChange broke keyboard entry: typing a year
 *  digit by digit emits 0002, 0020, 0202… — all before the floor — and each
 *  snapped the field back to Jan 1, 2027. Committing on every complete date
 *  was no better, since the parent rewrites `value` (e.g. to the week's
 *  Monday) under the cursor mid-typing. So edits sit in a local draft and
 *  commit after a short pause (which covers a calendar-popup pick), or on
 *  blur/Enter; anything before the floor is clamped at that point. */
const COMMIT_DELAY_MS = 700

export function FloorDateInput({ value, onCommit, id, className, "aria-label": ariaLabel }: FloorDateInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function commit(next: string) {
    if (timer.current) clearTimeout(timer.current)
    setDraft(null)
    if (next) onCommit(clampToScheduleStart(next))
  }

  return (
    <Input
      id={id}
      type="date"
      aria-label={ariaLabel}
      className={className}
      min={SCHEDULE_START_DATE}
      value={draft ?? value}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        if (timer.current) clearTimeout(timer.current)
        // Only a complete, on/after-floor date is worth committing on a pause;
        // partial or early values wait for blur/Enter.
        if (next && !isBeforeScheduleStart(next)) timer.current = setTimeout(() => commit(next), COMMIT_DELAY_MS)
      }}
      onBlur={() => draft !== null && commit(draft)}
      onKeyDown={(e) => e.key === "Enter" && draft !== null && commit(draft)}
    />
  )
}
