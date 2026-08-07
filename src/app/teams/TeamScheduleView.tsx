"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { format, parseISO, addDays, subDays } from "date-fns"
import { ChevronLeft, ChevronRight, FileText, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ColumnsView } from "@/components/budget/ColumnsView"
import { AgendaView } from "@/components/budget/AgendaView"
import { todayString, cn } from "@/lib/utils"
import { VIDEOS_ENABLED } from "@/lib/features"
import type { TeamWithMembers } from "@/types/index"

interface MyTeam extends TeamWithMembers {
  myRole: string
}

interface TeamScheduleViewProps {
  team: MyTeam
  mode: "columns" | "agenda"
}

export function TeamScheduleView({ team, mode }: TeamScheduleViewProps) {
  const [showStories, setShowStories] = useState(true)
  const [showVideos, setShowVideos] = useState(VIDEOS_ENABLED)
  const [date, setDate] = useState(() => todayString())

  // Reset the type toggle if the video flag changes mid-session (shouldn't
  // happen without a rebuild, but keeps state consistent).
  useEffect(() => {
    if (!VIDEOS_ENABLED) setShowVideos(false)
  }, [])

  const personIds = useMemo(
    () => team.members.map((m) => m.person.id),
    [team]
  )

  let parsedDate: Date
  try { parsedDate = parseISO(date) } catch { parsedDate = new Date() }

  const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd")
  const nextDate = format(addDays(parsedDate, 1), "yyyy-MM-dd")
  const displayDate = mode === "columns"
    ? format(parsedDate, "EEEE, MMMM d, yyyy")
    : `Week of ${format(parsedDate, "MMMM d, yyyy")}`
  const isToday = date === todayString()

  const noop = () => {}

  if (personIds.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">This team has no members yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" onClick={() => setDate(prevDate)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{displayDate}</h2>
            {isToday && <span className="text-xs font-medium text-primary">Today</span>}
          </div>
          <Button variant="outline" size="icon-sm" onClick={() => setDate(nextDate)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex divide-x overflow-hidden rounded-md border">
            <Button
              size="sm"
              variant="ghost"
              className={cn("rounded-none gap-1.5 text-xs", showStories && "bg-muted font-medium")}
              onClick={() => setShowStories((v) => !v)}
            >
              <FileText className="size-3.5" />
              Stories
            </Button>
            {VIDEOS_ENABLED && (
              <Button
                size="sm"
                variant="ghost"
                className={cn("rounded-none gap-1.5 text-xs", showVideos && "bg-muted font-medium")}
                onClick={() => setShowVideos((v) => !v)}
              >
                <Video className="size-3.5" />
                Videos
              </Button>
            )}
          </div>

          <Button asChild size="sm">
            <Link href="/stories/new">New Story</Link>
          </Button>
          {VIDEOS_ENABLED && (
            <Button asChild size="sm">
              <Link href="/videos/new">New Video</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {mode === "columns" ? (
        <ColumnsView
          date={date}
          showStories={showStories}
          showVideos={showVideos}
          selectMode={false}
          selectedIds={new Set()}
          onToggleSelect={noop}
          refreshTrigger={0}
          personIds={personIds}
          cacheKeyPrefix={`/api/budget/daily::team-${team.id}`}
        />
      ) : (
        <AgendaView
          date={date}
          showStories={showStories}
          showVideos={showVideos}
          selectMode={false}
          selectedIds={new Set()}
          onToggleSelect={noop}
          refreshTrigger={0}
          personIds={personIds}
          cacheKeyPrefix={`/api/budget/agenda::team-${team.id}`}
        />
      )}
    </div>
  )
}

export function TeamScheduleSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
