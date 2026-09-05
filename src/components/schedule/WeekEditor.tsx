"use client"

import { useState, useMemo } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AVAILABILITY_PRESETS,
  presetRows,
  presetForResolvedDay,
  segmentToStatus,
  type PresetId,
  type PresetRow,
} from "./availabilityPresets"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import { apiPath } from "@/lib/api-path"
import { weekdayAbbrev, shortDate } from "@/lib/utils"

type WeekEditorDay = { date: string; revert: true } | { date: string; segment: string; status: string }
type CustomStatuses = { am: PresetRow["status"]; pm: PresetRow["status"] }

const DEFAULT_CUSTOM: CustomStatuses = { am: "OUT", pm: "WORKING" }

interface WeekEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  /** The dates to edit, Monday first (the app's standard week — see
   *  mondayOf()/weekDatesFrom()) — but rendering doesn't actually assume
   *  that: each row's label is computed from its own date via
   *  weekdayAbbrev(), not from position, so a partial or oddly-ordered list
   *  (e.g. a month's first/last week from MonthCalendar) still labels
   *  correctly. */
  weekDates: string[]
  resolvedDays: MyScheduleDay[]
  onSaved: () => void
}

export function WeekEditor({ open, onOpenChange, personId, weekDates, resolvedDays, onSaved }: WeekEditorProps) {
  const dayByDate = useMemo(() => Object.fromEntries(resolvedDays.map((d) => [d.date, d])), [resolvedDays])

  const [selections, setSelections] = useState<Record<string, PresetId | "BASELINE">>(() =>
    Object.fromEntries(weekDates.map((date) => [date, presetForResolvedDay(dayByDate[date])]))
  )
  // Per-date AM/PM choice, only meaningful while that date's selection is
  // CUSTOM — seeded from the day's real current split (if any) so reopening
  // the editor for an existing custom day shows what's actually saved,
  // rather than presetRows()'s WORKING/WORKING fallback silently overwriting
  // it on save (the bug this state exists to prevent — see customFor()).
  const [customStatuses, setCustomStatuses] = useState<Record<string, CustomStatuses>>(() =>
    Object.fromEntries(
      weekDates
        .filter((date) => presetForResolvedDay(dayByDate[date]) === "CUSTOM")
        .map((date) => {
          const day = dayByDate[date]
          return [date, { am: day?.split ? segmentToStatus(day.am) : "OUT", pm: day?.split ? segmentToStatus(day.pm) : "WORKING" }]
        })
    )
  )
  const [saving, setSaving] = useState(false)

  // The single source of truth for a CUSTOM date's AM/PM values — used by
  // both the sub-selects' displayed `value` and handleSave's write, so what
  // gets saved always matches what's shown (no invisible default in between).
  function customFor(date: string): CustomStatuses {
    return customStatuses[date] ?? DEFAULT_CUSTOM
  }

  function setCustomStatus(date: string, half: "am" | "pm", status: PresetRow["status"]) {
    setCustomStatuses((s) => ({ ...s, [date]: { ...customFor(date), [half]: status } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const days: WeekEditorDay[] = weekDates.flatMap((date): WeekEditorDay[] => {
        const selection = selections[date]
        if (selection === "BASELINE") {
          // Let the server delete whatever override exists for this date and
          // fall back to the standing pattern/holiday baseline — correct for
          // split (AM/PM) days too, which a guessed FULL_DAY status can't
          // express (see computeWeekDiff's `revert` handling).
          return [{ date, revert: true as const }]
        }
        const custom = selection === "CUSTOM" ? customFor(date) : undefined
        return presetRows(selection, custom).map((row) => ({ date, segment: row.segment, status: row.status }))
      })

      const res = await fetch(apiPath("/api/schedule/availability/week"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, days }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to save week")
      }
      toast.success("Week saved")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save week")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit week</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {weekDates.map((date) => {
            const selection = selections[date]
            const custom = customFor(date)
            return (
              <div key={date} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">
                    {weekdayAbbrev(date)} {shortDate(date)}
                  </span>
                  <Select
                    value={selection}
                    onValueChange={(v) => setSelections((s) => ({ ...s, [date]: v as PresetId | "BASELINE" }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BASELINE">As scheduled (no change)</SelectItem>
                      {AVAILABILITY_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* CUSTOM has no single status of its own — without these,
                    handleSave had nothing to send but presetRows()'s
                    WORKING/WORKING default, silently overwriting a real
                    half-day override the moment any other day in the week
                    was saved. */}
                {selection === "CUSTOM" && (
                  <div className="pl-[6.75rem] grid grid-cols-2 gap-2">
                    <Select value={custom.am} onValueChange={(v) => setCustomStatus(date, "am", v as PresetRow["status"])}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OUT">AM: Out</SelectItem>
                        <SelectItem value="WORKING">AM: Working</SelectItem>
                        <SelectItem value="UNAVAILABLE">AM: Unavailable</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={custom.pm} onValueChange={(v) => setCustomStatus(date, "pm", v as PresetRow["status"])}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OUT">PM: Out</SelectItem>
                        <SelectItem value="WORKING">PM: Working</SelectItem>
                        <SelectItem value="UNAVAILABLE">PM: Unavailable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save week"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
