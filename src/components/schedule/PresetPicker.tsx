"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AVAILABILITY_PRESETS, presetRows, presetForResolvedDay, segmentToStatus, summarizeClear, type PresetId, type PresetRow } from "./availabilityPresets"
import { shiftLabel } from "./AvailabilityChip"
import { apiPath } from "@/lib/api-path"
import { SCHEDULE_START_DATE, SCHEDULE_START_LABEL, isBeforeScheduleStart } from "@/lib/schedule"
import type { MyScheduleDay } from "@/lib/hooks/useMySchedule"

interface PresetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  /** The date the picker was opened for — start/end default here but are editable, so a single click can be widened into a range. */
  date: string
  /** Pre-fills the end date to something other than `date` — used by
   *  /schedule/teams' drag-entry, which opens the picker already scoped to a
   *  dragged range instead of a single day. Defaults to `date`. */
  initialEndDate?: string
  /** `date`'s already-resolved entry, if any — pre-fills the preset, note,
   *  and (for a split day) each half's status so reopening the picker for a
   *  day that already has an override shows what's actually saved instead
   *  of a blank form. Without this the note in particular looked like it
   *  hadn't saved on reopen, even though it had. Only meaningful for a
   *  single day; omit for a range picker with no one "current" state. */
  initialDay?: MyScheduleDay
  /** The resolved days the opening view already has loaded, by date. Lets
   *  "Clear" say how many days it will clear (and hide when there's
   *  nothing to clear), and lists shift days in the selection. */
  knownDays?: Record<string, MyScheduleDay | undefined>
  onSaved: () => void
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
}

async function postAvailability(personId: string, startDate: string, endDate: string, rows: PresetRow[], note: string, skipNonWorkingDays: boolean) {
  const res = await fetch(apiPath("/api/schedule/availability"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personId,
      startDate,
      endDate,
      rows,
      note: note || null,
      skipNonWorkingDays,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? "Failed to save")
  }
  return res.json() as Promise<{ entries: unknown[]; warnings: { label: string; dates: string[] }[] }>
}

export function PresetPicker({ open, onOpenChange, personId, date, initialEndDate, initialDay, knownDays, onSaved }: PresetPickerProps) {
  const [preset, setPreset] = useState<PresetId>(() => {
    const p = presetForResolvedDay(initialDay)
    return p === "BASELINE" ? "OUT" : p
  })
  const [startDate, setStartDate] = useState(date)
  const [endDate, setEndDate] = useState(initialEndDate ?? date)
  // A split day can carry two different notes (one per half); this form has
  // one note field, so prefer whichever half actually has one rather than
  // showing blank when either does.
  const [note, setNote] = useState(() => initialDay?.note ?? initialDay?.amNote ?? initialDay?.pmNote ?? "")
  const [skipNonWorkingDays, setSkipNonWorkingDays] = useState(true)
  const [amStatus, setAmStatus] = useState<PresetRow["status"]>(() =>
    initialDay?.split ? segmentToStatus(initialDay.am) : "OUT"
  )
  const [pmStatus, setPmStatus] = useState<PresetRow["status"]>(() =>
    initialDay?.split ? segmentToStatus(initialDay.pm) : "WORKING"
  )
  const [saving, setSaving] = useState(false)

  const isRange = startDate !== endDate
  // Only meaningful for a range — the checkbox itself is hidden for a single
  // day, but its `true` default was still being sent regardless. For a
  // single day that already resolves to "off" (a standing day off, or a
  // holiday), that silently made expandDateRange() skip the only date in
  // the request — the write returned success with zero entries created, so
  // e.g. a one-day "Working" override meant to cover a holiday appeared to
  // save but never touched the database.
  const effectiveSkip = isRange && skipNonWorkingDays

  async function handleSave() {
    // `min` on a date input doesn't stop typed values; the API rejects these
    // too (issue #85) but with a generic message.
    if (isBeforeScheduleStart(startDate) || isBeforeScheduleStart(endDate)) {
      toast.error(`The schedule starts ${SCHEDULE_START_LABEL} — earlier dates live in the spreadsheet.`)
      return
    }
    setSaving(true)
    try {
      const rows = preset === "CUSTOM" ? presetRows(preset, { am: amStatus, pm: pmStatus }) : presetRows(preset)
      const result = await postAvailability(personId, startDate, endDate, rows, note, effectiveSkip)
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => toast.warning(`${w.label}: ${w.dates.join(", ")}`))
      } else {
        toast.success("Saved")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  // "Clear" deletes every explicit entry in the selected range, so each day
  // falls back to its shift, standing pattern or holiday. Shifts can't be
  // cleared here — they change only on /schedule/shifts — so shift days in
  // the selection get a notice instead. When the whole range is loaded, the
  // button states the count and hides if there's nothing to clear; past
  // what the view loaded, it shows a plain "Clear".
  const clearSummary = useMemo(() => summarizeClear(startDate, endDate, knownDays ?? {}), [startDate, endDate, knownDays])
  const clearCount = clearSummary.overrideDates.length
  const showClear = !clearSummary.complete || clearCount > 0
  const clearLabel = clearSummary.complete && isRange ? `Clear ${clearCount} ${clearCount === 1 ? "day" : "days"}` : "Clear"

  async function handleClear() {
    if (isBeforeScheduleStart(startDate) || isBeforeScheduleStart(endDate)) {
      toast.error(`The schedule starts ${SCHEDULE_START_LABEL} — earlier dates live in the spreadsheet.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(apiPath("/api/schedule/availability/clear"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, startDate, endDate }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to clear")
      }
      const result = (await res.json()) as { cleared: number; shiftDates: string[] }
      toast.success(result.cleared > 0 ? "Cleared" : "Nothing to clear")
      if (result.shiftDates.length > 0) {
        toast.info(`Shifts stay as assigned (${result.shiftDates.map(shortDate).join(", ")}) — change them on the Shifts page.`)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update availability</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-start">Start date</Label>
              <Input id="pp-start" type="date" min={SCHEDULE_START_DATE} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-end">End date</Label>
              <Input id="pp-end" type="date" min={SCHEDULE_START_DATE} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pp-preset">What&apos;s changing</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetId)}>
              <SelectTrigger id="pp-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABILITY_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === "CUSTOM" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pp-am">Morning</Label>
                <Select value={amStatus} onValueChange={(v) => setAmStatus(v as PresetRow["status"])}>
                  <SelectTrigger id="pp-am">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OUT">Out</SelectItem>
                    <SelectItem value="WORKING">Working</SelectItem>
                    <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-pm">Afternoon</Label>
                <Select value={pmStatus} onValueChange={(v) => setPmStatus(v as PresetRow["status"])}>
                  <SelectTrigger id="pp-pm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OUT">Out</SelectItem>
                    <SelectItem value="WORKING">Working</SelectItem>
                    <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isRange && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="pp-skip"
                checked={skipNonWorkingDays}
                onCheckedChange={(checked) => setSkipNonWorkingDays(checked === true)}
              />
              <Label htmlFor="pp-skip" className="font-normal">
                Skip days I&apos;m already off (standing days off and holidays)
              </Label>
            </div>
          )}

          {clearSummary.shiftDates.length > 0 && (
            <div className="rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
              <p>
                {clearSummary.shiftDates
                  .map((d) => `${shiftLabel(knownDays?.[d]?.shiftRoles ?? [])} ${shortDate(d)}`)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs">
                Shifts are changed only on the{" "}
                <Link href={`/schedule/shifts?start=${clearSummary.shiftDates[0]}`} className="font-medium underline underline-offset-2">
                  Shifts page
                </Link>
                . Marking out here keeps the shift assigned and flags it there for reassignment.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pp-note">Note</Label>
            <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {showClear ? (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleClear}
                disabled={saving}
                title="Remove the entries in these dates, so each day goes back to its shift, regular schedule or holiday. Shifts aren't changed."
              >
                {clearLabel}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
