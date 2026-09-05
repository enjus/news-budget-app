"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AVAILABILITY_PRESETS, presetRows, type PresetId, type PresetRow } from "./availabilityPresets"
import { apiPath } from "@/lib/api-path"

interface PresetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  /** The date the picker was opened for — start/end default here but are editable, so a single click can be widened into a range. */
  date: string
  onSaved: () => void
}

async function postAvailability(personId: string, startDate: string, endDate: string, row: PresetRow, note: string, skipNonWorkingDays: boolean) {
  const res = await fetch(apiPath("/api/schedule/availability"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personId,
      startDate,
      endDate,
      segment: row.segment,
      status: row.status,
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

export function PresetPicker({ open, onOpenChange, personId, date, onSaved }: PresetPickerProps) {
  const [preset, setPreset] = useState<PresetId>("OUT")
  const [startDate, setStartDate] = useState(date)
  const [endDate, setEndDate] = useState(date)
  const [note, setNote] = useState("")
  const [skipNonWorkingDays, setSkipNonWorkingDays] = useState(true)
  const [amStatus, setAmStatus] = useState<PresetRow["status"]>("OUT")
  const [pmStatus, setPmStatus] = useState<PresetRow["status"]>("WORKING")
  const [saving, setSaving] = useState(false)

  const isRange = startDate !== endDate

  async function handleSave() {
    setSaving(true)
    try {
      const rows = preset === "CUSTOM" ? presetRows(preset, { am: amStatus, pm: pmStatus }) : presetRows(preset)
      const allWarnings: { label: string; dates: string[] }[] = []
      for (const row of rows) {
        const result = await postAvailability(personId, startDate, endDate, row, note, skipNonWorkingDays)
        allWarnings.push(...result.warnings)
      }
      if (allWarnings.length > 0) {
        allWarnings.forEach((w) => toast.warning(`${w.label}: ${w.dates.join(", ")}`))
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
              <Input id="pp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-end">End date</Label>
              <Input id="pp-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pp-preset">What's changing</Label>
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
                Skip days I'm already off (standing days off and holidays)
              </Label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pp-note">Note</Label>
            <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
