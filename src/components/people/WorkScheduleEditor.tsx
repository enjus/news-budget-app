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

  // Seed local editable state from the resolved pattern whenever fresh data arrives.
  useEffect(() => {
    if (data) setDays(resolveWeekPattern(data))
  }, [data])

  function toggleDay(weekday: number) {
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
      toast.success("Standing pattern saved")
      mutate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save pattern")
    } finally {
      setSaving(false)
    }
  }

  const isDefault = data && diffFromDefaultWeek(resolveWeekPattern(data)).length === 0

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Standing pattern</h2>
          <p className="text-xs text-muted-foreground">
            All seven days shown, pre-filled with the resolved week. Only what
            differs from Mon&ndash;Fri is saved.
            {isDefault && " Currently: Mon–Fri (default)."}
          </p>
        </div>
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
