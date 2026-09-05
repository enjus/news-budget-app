"use client"

import { useState, useMemo } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AVAILABILITY_PRESETS, presetRows, type PresetId } from "./availabilityPresets"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"
import { apiPath } from "@/lib/api-path"

interface WeekEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  /** The 7 dates in the displayed week, Sunday first. */
  weekDates: string[]
  resolvedDays: MyScheduleDay[]
  onSaved: () => void
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Best-effort mapping from a resolved day back to the preset that produced
 *  it — "BASELINE" (no override) unless an explicit availability entry is
 *  behind the result. Split days default to CUSTOM so both halves stay
 *  independently editable rather than collapsing to a single preset. */
function presetForResolvedDay(day: MyScheduleDay | undefined): PresetId | "BASELINE" {
  if (!day) return "BASELINE"
  if (day.split) return "CUSTOM"
  if (day.status === "off" && day.reason === "availability") return "OUT"
  if (day.status === "working" && day.source === "availability") return "WORKING"
  if (day.status === "unavailable") return "UNAVAILABLE"
  return "BASELINE"
}

/** The FULL_DAY status a "no override" selection resolves to, so reverting
 *  to baseline round-trips through computeWeekDiff() as a true no-op/delete
 *  rather than accidentally writing a redundant row. */
function baselineFullDayStatus(day: MyScheduleDay | undefined): "OUT" | "WORKING" | "UNAVAILABLE" {
  if (!day) return "WORKING"
  if (day.split) return "WORKING" // rare to leave a split day at BASELINE; degrade sensibly
  if (day.status === "off") return "OUT"
  if (day.status === "unavailable") return "UNAVAILABLE"
  return "WORKING"
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
      const days = weekDates.flatMap((date) => {
        const selection = selections[date]
        if (selection === "BASELINE") {
          return [{ date, segment: "FULL_DAY" as const, status: baselineFullDayStatus(dayByDate[date]) }]
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
          {weekDates.map((date, i) => (
            <div key={date} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-muted-foreground">
                {WEEKDAY_LABELS[i]} {date.slice(5)}
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
