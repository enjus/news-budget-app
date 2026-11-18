"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RequestRow } from "@/components/visuals/RequestRow"
import { useVisualRequests } from "@/lib/hooks/useVisualRequests"
import { canCreateContent } from "@/lib/utils"
import {
  DEFAULT_REQUEST_FILTERS,
  REQUEST_LIST_CAP,
  VISUAL_TYPES,
  isDefaultFilters,
  isStatusChipActive,
  parseRequestFilters,
  requestFiltersToQuery,
  toggleStatusChip,
  toggleTypeFilter,
  type RequestFilters,
  type StatusChip,
} from "@/lib/visual-request-list"
import { REQUEST_STATUSES, VISUAL_STATUS_LABELS } from "@/lib/visual-statuses"
import { VISUAL_TYPE_LABELS } from "@/lib/visual-types"

const STATUS_CHIPS: { chip: StatusChip; label: string }[] = [
  { chip: "open", label: "Open" },
  ...REQUEST_STATUSES.map((s) => ({ chip: s, label: VISUAL_STATUS_LABELS[s] })),
  { chip: "closed", label: "All closed" },
]

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="xs" variant={active ? "default" : "outline"} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * The visuals desk's queue (/requests). Filters live in the URL, so a filtered
 * view survives a reload and can be shared; an unreadable URL falls back to the
 * default view. Rows open the request page, where every action happens.
 */
export function RequestsView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()

  const parsed = parseRequestFilters(new URLSearchParams(searchParams.toString()))
  const filters = parsed.ok ? parsed.filters : DEFAULT_REQUEST_FILTERS
  const { requests, truncated, isLoading, error } = useVisualRequests(filters)

  const personId = session?.user?.personId ?? null
  const canFile = session?.user ? canCreateContent(session.user.appRole) : false

  function setFilters(next: RequestFilters) {
    const query = requestFiltersToQuery(next)
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const toggle = <K extends "assignee" | "requester" | "placement">(key: K, value: RequestFilters[K]) =>
    setFilters({ ...filters, [key]: filters[key] === value ? null : value })

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Visual requests</h1>
          <p className="text-sm text-muted-foreground">
            Photos, graphics, maps and video requested from the visuals desk. Open one to assign or work it.
          </p>
        </div>
        {canFile && (
          <Button asChild size="sm">
            <Link href="/requests/new">
              <Plus className="size-4" />
              New request
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {STATUS_CHIPS.map(({ chip, label }) => (
            <Chip key={chip} active={isStatusChipActive(filters, chip)} onClick={() => setFilters(toggleStatusChip(filters, chip))}>
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Type and people">
          {VISUAL_TYPES.map((t) => (
            <Chip key={t} active={filters.types.includes(t)} onClick={() => setFilters(toggleTypeFilter(filters, t))}>
              {VISUAL_TYPE_LABELS[t]}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {personId && (
            <Chip active={filters.assignee === "me"} onClick={() => toggle("assignee", "me")}>
              Assigned to me
            </Chip>
          )}
          {personId && (
            <Chip active={filters.requester === "me"} onClick={() => toggle("requester", "me")}>
              Filed by me
            </Chip>
          )}
          <Chip active={filters.assignee === "none"} onClick={() => toggle("assignee", "none")}>
            Unassigned
          </Chip>
          <Chip active={filters.placement === "unplaced"} onClick={() => toggle("placement", "unplaced")}>
            Unplaced only
          </Chip>
          {!isDefaultFilters(filters) && (
            <Button type="button" size="xs" variant="ghost" onClick={() => setFilters(DEFAULT_REQUEST_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>

        {filters.status !== "open" && (
          <p className="text-xs text-muted-foreground">Delivered, declined and canceled requests show for 90 days.</p>
        )}
      </div>

      {!parsed.ok && (
        <p className="text-sm text-muted-foreground">That link had filters this page doesn&apos;t recognize, so it&apos;s showing open requests.</p>
      )}

      {isLoading && requests.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error && requests.length === 0 ? (
        <p className="text-sm text-destructive">Couldn&apos;t load requests. Try reloading the page.</p>
      ) : requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {isDefaultFilters(filters) ? "No open requests." : "No requests match these filters."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the {REQUEST_LIST_CAP} most recently updated. Narrow the filters to see the rest.
            </p>
          )}
        </>
      )}
    </div>
  )
}
