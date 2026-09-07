"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  WEEKDAY_OPTIONS,
  WORK_SCHEDULE_SEGMENT_LABELS,
  resolveWeekPattern,
  diffFromDefaultWeek,
  cn,
} from "@/lib/utils"

interface DayRow {
  weekday: number
  segment: string
}

const fetcher = (url: string) => fetch(apiPath(url)).then((r) => r.json())

export function WorkScheduleEditor({ personId }: { personId: string }) {
  const { data, isLoading, mutate } = useSWR<DayRow[]>(
    `/api/people/${personId}/work-schedule`,
    fetcher
  )
  const [days, setDays] = useState<DayRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Seed local editable state from the resolved pattern whenever fresh data
  // arrives — but not if the admin has unsaved toggles in progress, or a
  // background SWR revalidation (e.g. window refocus) would silently wipe them.
  useEffect(() => {
    if (data && !dirty) setDays(resolveWeekPattern(data))
  }, [data, dirty])

  function toggleDay(weekday: number) {
    setDirty(true)
    setDays((prev) =>
      (prev ?? []).map((d) =>
        d.weekday === weekday
          ? { ...d, segment: d.segment === "FULL_DAY" ? "OFF" : "FULL_DAY" }
          : d
      )
    )
  }

  async function handleSave() {
    if (!days) return
    setSaving(true)
    try {
      const res = await fetch(apiPath(`/api/people/${personId}/work-schedule`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: diffFromDefaultWeek(days) }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success("Regular work week saved")
      setDirty(false)
      mutate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save regular work week")
      // `dirty` intentionally stays true here: the user's unsaved toggles
      // are still in `days` and must not be silently overwritten by the next
      // SWR revalidation just because the save attempt failed. Resetting it
      // would discard their pending edits, not just "unstick" the resync.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Regular work week</h2>
        <Button size="sm" onClick={handleSave} disabled={saving || isLoading || !days}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {isLoading || !days ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_OPTIONS.map((wd) => {
            const day = days.find((d) => d.weekday === wd.value)
            const working = day?.segment === "FULL_DAY"
            return (
              <button
                key={wd.value}
                type="button"
                onClick={() => toggleDay(wd.value)}
                className={cn(
                  "flex flex-col items-center rounded-md border px-3 py-1.5 text-xs transition-colors",
                  working
                    ? "border-transparent bg-secondary text-secondary-foreground"
                    : "border-input text-muted-foreground hover:bg-accent"
                )}
              >
                <span className="font-medium">{wd.abbrev}</span>
                <span>{WORK_SCHEDULE_SEGMENT_LABELS[day?.segment ?? "OFF"]}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
