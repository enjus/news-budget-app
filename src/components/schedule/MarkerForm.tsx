"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CALENDAR_MARKER_KIND_LABELS } from "@/lib/utils"

export interface MarkerFormData {
  kind: string
  label: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  note: string
  observed: boolean
}

export function MarkerForm({
  initial,
  onSave,
  onClose,
  isCreate,
}: {
  initial?: Partial<MarkerFormData>
  onSave: (data: MarkerFormData) => Promise<void>
  onClose: () => void
  isCreate: boolean
}) {
  const [data, setData] = useState<MarkerFormData>({
    kind: initial?.kind ?? "HOLIDAY",
    label: initial?.label ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    note: initial?.note ?? "",
    observed: initial?.observed ?? true,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(data)
      onClose()
    } catch {
      // error toast handled in onSave
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="cm-kind">Kind</Label>
        <Select value={data.kind} onValueChange={(kind) => setData((d) => ({ ...d, kind }))}>
          <SelectTrigger id="cm-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CALENDAR_MARKER_KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cm-label">Label</Label>
        <Input
          id="cm-label"
          value={data.label}
          onChange={(e) => setData((d) => ({ ...d, label: e.target.value }))}
          required
          placeholder="e.g. Thanksgiving, Holiday season — no PTO"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cm-start">Start date</Label>
          <Input
            id="cm-start"
            type="date"
            value={data.startDate}
            onChange={(e) => setData((d) => ({ ...d, startDate: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-end">End date (inclusive)</Label>
          <Input
            id="cm-end"
            type="date"
            value={data.endDate}
            onChange={(e) => setData((d) => ({ ...d, endDate: e.target.value }))}
            required
          />
        </div>
      </div>
      {data.kind === "HOLIDAY" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="cm-observed"
            checked={data.observed}
            onCheckedChange={(checked) => setData((d) => ({ ...d, observed: checked === true }))}
          />
          <Label htmlFor="cm-observed" className="font-normal">
            Observed — the newsroom is off, and shifts are needed
          </Label>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="cm-note">Note</Label>
        <textarea
          id="cm-note"
          value={data.note}
          onChange={(e) => setData((d) => ({ ...d, note: e.target.value }))}
          rows={2}
          placeholder="Optional"
          className="w-full rounded-md border bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isCreate ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  )
}
