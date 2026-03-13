"use client"

import Link from "next/link"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Camera, Video, Image, Map, AlertTriangle, MapPin, Clock, FileText } from "lucide-react"
import {
  cn,
  surname,
  MEDIA_REQUEST_TYPE_LABELS,
  MEDIA_REQUEST_STATUS_LABELS,
  mediaRequestStatusColor,
  MEDIA_ASSIGNMENT_ROLE_LABELS,
} from "@/lib/utils"
import type { MediaRequestListItem } from "@/types/index"

const TYPE_ICON: Record<string, React.ElementType> = {
  PHOTO: Camera,
  VIDEO: Video,
  PHOTO_VIDEO: Camera,
  GRAPHIC: Image,
  MAP: Map,
}

interface MediaRequestCardProps {
  request: MediaRequestListItem
}

function formatEventDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const fakeLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
  return format(fakeLocal, "MMM d, yyyy · h:mm a")
}

export function MediaRequestCard({ request }: MediaRequestCardProps) {
  const Icon = TYPE_ICON[request.type] ?? Camera
  const isUrgent = request.priority === "URGENT"

  return (
    <Link
      href={`/media-requests/${request.id}`}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50",
        isUrgent && "border-l-4 border-l-red-400",
      )}
    >
      <div className="flex flex-col gap-1.5">
        {/* Top row: title + type badge + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Icon className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="font-semibold leading-none">{request.title}</span>
            {isUrgent && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="size-2.5" />
                Urgent
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {MEDIA_REQUEST_TYPE_LABELS[request.type] ?? request.type}
            </Badge>
            <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium", mediaRequestStatusColor(request.status))}>
              {MEDIA_REQUEST_STATUS_LABELS[request.status] ?? request.status}
            </span>
          </div>
        </div>

        {/* Event date + location */}
        {(request.eventDateTime || request.location) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {request.eventDateTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatEventDate(request.eventDateTime)}
              </span>
            )}
            {request.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {request.location}
              </span>
            )}
          </div>
        )}

        {/* Linked story */}
        {request.story && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <FileText className="size-3" />
            <span>{request.story.slug}</span>
          </div>
        )}

        {/* Deadline */}
        {request.deadline && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="size-3" />
            <span className="font-medium">Deadline:</span>
            {formatEventDate(request.deadline)}
          </div>
        )}

        {/* People row */}
        <div className="flex flex-wrap items-center gap-1">
          {request.assignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
              title={`${a.person.name} — ${MEDIA_ASSIGNMENT_ROLE_LABELS[a.role] ?? a.role}`}
            >
              {surname(a.person.name)}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground">
            by {request.requestedBy.name}
          </span>
        </div>
      </div>
    </Link>
  )
}
