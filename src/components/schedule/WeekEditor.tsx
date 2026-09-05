"use client"

import { useState, useMemo } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AVAILABILITY_PRESETS, presetRows, presetForResolvedDay, type PresetId } from "./availabilityPresets"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import { apiPath } from "@/lib/api-path"
import { weekdayAbbrev, shortDate } from "@/lib/utils"

type WeekEditorDay = { date: string; revert: true } | { date: string; segment: string; status: string }

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
  const [saving, setSaving] = useState(false)

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
        return presetRows(selection).map((row) => ({ date, segment: row.segment, status: row.status }))
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
          {weekDates.map((date) => (
            <div key={date} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-muted-foreground">
                {weekdayAbbrev(date)} {shortDate(date)}
              </span>
              <Select
                value={selections[date]}
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
          ))}
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
