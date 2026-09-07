"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkerForm, type MarkerFormData } from "@/components/schedule/MarkerForm"
import { useCalendarMarkers } from "@/lib/hooks/useCalendarMarkers"
import { CALENDAR_MARKER_KIND_LABELS, todayString, isoDateOnly } from "@/lib/utils"
import { apiPath } from "@/lib/api-path"
import type { CalendarMarker } from "@prisma/client"

const KIND_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  HOLIDAY: "default",
  BLACKOUT: "secondary",
  NOTE: "outline",
}

export function CalendarView() {
  const currentYear = Number(todayString().slice(0, 4))
  const [year, setYear] = useState(currentYear)
  const [kindFilter, setKindFilter] = useState<string>("ALL")
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const { markers, isLoading, mutate } = useCalendarMarkers({
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  })

  // From roughly October, prompt if next year has nothing yet — holidays
  // need to be entered before shifts are filled months ahead (issue #19 §3).
  const nowMonth = Number(todayString().slice(5, 7))
  const nextYear = currentYear + 1
  const showNextYearPrompt = year === currentYear && nowMonth >= 10
  const { markers: nextYearMarkers, isLoading: nextYearLoading } = useCalendarMarkers({
    start: `${nextYear}-01-01`,
    end: `${nextYear}-12-31`,
  })
  // The reminder is specifically about holidays/blackouts ("No holidays or
  // blackout added..." below) — an unrelated NOTE marker (e.g. a "Q1
  // planning day" reminder) must not silently suppress it just because
  // *some* marker exists for next year.
  const nextYearHolidayOrBlackout = nextYearMarkers.filter((m) => m.kind === "HOLIDAY" || m.kind === "BLACKOUT")

  const visibleMarkers = kindFilter === "ALL" ? markers : markers.filter((m) => m.kind === kindFilter)

  async function handleCreate(data: MarkerFormData) {
    const res = await fetch(apiPath("/api/schedule/markers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, note: data.note || null }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to create marker")
      throw new Error()
    }
    toast.success("Marker created")
    await mutate()
  }

  async function handleEdit(id: string, data: MarkerFormData) {
    const res = await fetch(apiPath(`/api/schedule/markers/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, note: data.note || null }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to update marker")
      throw new Error()
    }
    toast.success("Marker updated")
    await mutate()
  }

  async function handleDelete(marker: CalendarMarker) {
    if (!confirm(`Delete "${marker.label}"? This cannot be undone.`)) return
    const res = await fetch(apiPath(`/api/schedule/markers/${marker.id}`), { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete marker")
    } else {
      toast.success("Marker deleted")
      await mutate()
    }
  }

  async function handleSeedHolidays(targetYear: number) {
    setSeeding(true)
    try {
      const res = await fetch(apiPath("/api/schedule/markers/seed-holidays"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: targetYear }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? "Failed to add holidays")
        return
      }
      toast.success(`Added standard US holidays for ${targetYear}`)
      await mutate()
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Newsroom calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium w-14 text-center">{year}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {showNextYearPrompt && !nextYearLoading && nextYearHolidayOrBlackout.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-sm">
            No holidays or blackout added for {nextYear} yet — shifts get filled months ahead, so it's worth adding these soon.
          </p>
          <Button size="sm" variant="outline" onClick={() => setYear(nextYear)}>
            Go to {nextYear}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All kinds</SelectItem>
            {Object.entries(CALENDAR_MARKER_KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={seeding}
            onClick={() => handleSeedHolidays(year)}
          >
            <Sparkles className="size-4" />
            Add standard US holidays for {year}
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New marker
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New calendar marker</DialogTitle>
              </DialogHeader>
              <MarkerForm isCreate onSave={handleCreate} onClose={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Kind</th>
                <th className="px-4 py-2.5 text-left font-medium">Label</th>
                <th className="px-4 py-2.5 text-left font-medium">Dates</th>
                <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Note</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {visibleMarkers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No markers for {year}.
                  </td>
                </tr>
              ) : (
                visibleMarkers.map((marker) => {
                  const start = isoDateOnly(String(marker.startDate))
                  const end = isoDateOnly(String(marker.endDate))
                  return (
                    <tr key={marker.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant={KIND_BADGE_VARIANT[marker.kind] ?? "outline"}>
                          {CALENDAR_MARKER_KIND_LABELS[marker.kind] ?? marker.kind}
                        </Badge>
                        {marker.kind === "HOLIDAY" && !marker.observed && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(not observed)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{marker.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{start === end ? start : `${start} – ${end}`}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{marker.note ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Dialog open={editingId === marker.id} onOpenChange={(open) => setEditingId(open ? marker.id : null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Edit marker">
                                <Pencil className="size-3.5" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit marker</DialogTitle>
                              </DialogHeader>
                              <MarkerForm
                                isCreate={false}
                                initial={{
                                  kind: marker.kind,
                                  label: marker.label,
                                  startDate: start,
                                  endDate: end,
                                  note: marker.note ?? "",
                                  observed: marker.observed,
                                }}
                                onSave={(data) => handleEdit(marker.id, data)}
                                onClose={() => setEditingId(null)}
                              />
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete marker"
                            onClick={() => handleDelete(marker)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
