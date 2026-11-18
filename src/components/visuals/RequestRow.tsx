import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatPubDate } from "@/lib/utils"
import { VISUAL_TYPE_LABELS, type VisualTypeValue } from "@/lib/visual-types"
import type { VisualRequestListItem } from "@/types/index"
import { UrgentBadge, VisualStatusBadge } from "./VisualStatusBadge"

/** When it's due: "Needed by …", else "Event …" (both newsroom time encoded as UTC). */
function whenLine(r: VisualRequestListItem): string | null {
  if (r.deadline) return `Needed by ${formatPubDate(r.deadline, false)}`
  if (r.eventDateTime) return `Event ${formatPubDate(r.eventDateTime, false)}`
  return null
}

/**
 * One dashboard row. The whole row opens the request page (a stretched link
 * on the description); the story chip is its own link on top, so the two
 * anchors aren't nested. One line on wide screens, wrapping on narrow ones.
 */
export function RequestRow({ request: r }: { request: VisualRequestListItem }) {
  const when = whenLine(r)
  return (
    <li className="relative rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={r.type === "PHOTO" ? "default" : "secondary"}>
            {VISUAL_TYPE_LABELS[r.type as VisualTypeValue] ?? r.type}
          </Badge>
          <VisualStatusBadge status={r.status} />
          {r.priority === "URGENT" && <UrgentBadge />}
        </div>

        <Link
          href={`/requests/${r.id}`}
          className="min-w-[12rem] flex-1 truncate text-sm font-medium after:absolute after:inset-0 after:content-['']"
        >
          {r.description || "(no description)"}
        </Link>

        {r.story ? (
          <Link
            href={`/stories/${r.story.id}`}
            title={r.story.budgetLine}
            className="relative z-10 max-w-[14rem] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-xs hover:bg-background"
          >
            {r.story.slug}
          </Link>
        ) : (
          <span className="shrink-0 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
            No story
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>From {r.requestedBy?.name ?? "a deleted person"}</span>
        <span>{r.person ? `Assigned to ${r.person.name}` : <em>Unassigned</em>}</span>
        {when && <span>{when}</span>}
        {r.location && <span className="max-w-[16rem] truncate">{r.location}</span>}
      </div>
    </li>
  )
}
