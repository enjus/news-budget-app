// The 6 presets from issue #19 §4 — the picker never makes anyone reason
// about segments, it just maps a plain-English choice to the row(s) that
// get written. Shared between the day-level PresetPicker and the one-off
// WeekEditor so the two surfaces can't drift apart.

export type PresetId = "OUT" | "WORKING" | "UNAVAILABLE" | "HALF_AM" | "HALF_PM" | "CUSTOM"

export const AVAILABILITY_PRESETS: { id: PresetId; label: string }[] = [
  { id: "OUT", label: "Out" },
  { id: "WORKING", label: "Working (on a normal day off or holiday)" },
  { id: "UNAVAILABLE", label: "Working, unavailable (off site, training, court, etc.)" },
  { id: "HALF_AM", label: "Half day — here in the morning" },
  { id: "HALF_PM", label: "Half day — here in the afternoon" },
  { id: "CUSTOM", label: "Custom (set morning/afternoon independently)" },
]

export interface PresetRow {
  segment: "FULL_DAY" | "MORNING" | "AFTERNOON"
  status: "OUT" | "WORKING" | "UNAVAILABLE"
}

export function presetRows(id: PresetId, custom?: { am: PresetRow["status"]; pm: PresetRow["status"] }): PresetRow[] {
  switch (id) {
    case "OUT":
      return [{ segment: "FULL_DAY", status: "OUT" }]
    case "WORKING":
      return [{ segment: "FULL_DAY", status: "WORKING" }]
    case "UNAVAILABLE":
      return [{ segment: "FULL_DAY", status: "UNAVAILABLE" }]
    case "HALF_AM":
      // Here in the morning — the afternoon is the exception, so that's the
      // row written; the morning falls back through the pattern normally.
      return [{ segment: "AFTERNOON", status: "OUT" }]
    case "HALF_PM":
      return [{ segment: "MORNING", status: "OUT" }]
    case "CUSTOM":
      return [
        { segment: "MORNING", status: custom?.am ?? "WORKING" },
        { segment: "AFTERNOON", status: custom?.pm ?? "WORKING" },
      ]
  }
}
