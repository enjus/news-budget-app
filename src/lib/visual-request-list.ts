// The /requests dashboard's list query (issue #23, slice 3): the filter model
// shared by the page's URL and GET /api/visuals, the Prisma `where` built from
// it, and the sort. Pure functions only — see docs/visual-requests-slice-3.md §2–3.

import type { Prisma } from "@prisma/client"
import {
  OPEN_REQUEST_STATUSES,
  REQUEST_STATUSES,
  TERMINAL_STATUSES,
  isTerminalStatus,
  type VisualStatus,
} from "./visual-statuses"
import type { VisualTypeValue } from "./visual-types"

export const VISUAL_TYPES: readonly VisualTypeValue[] = ["PHOTO", "GRAPHIC", "MAP", "VIDEO"]

/** Closed requests (delivered, declined, canceled) older than this drop off the dashboard, until archiving exists. */
export const CLOSED_REQUEST_WINDOW_DAYS = 90

/** Most rows GET /api/visuals returns; past this the response says `truncated: true`. */
export const REQUEST_LIST_CAP = 500

/**
 * What the dashboard is showing. The same shape is read from the page URL and
 * from GET /api/visuals's query string, so a filtered view is shareable.
 * `null` means "any".
 */
export interface RequestFilters {
  /** "open" (the default), "closed", or an explicit list. Never includes PLANNED. */
  status: "open" | "closed" | VisualStatus[]
  /** Empty means every type. */
  types: VisualTypeValue[]
  /** A person id, "me", or "none" (unassigned). */
  assignee: string | null
  /** A person id or "me". */
  requester: string | null
  placement: "placed" | "unplaced" | null
}

export const DEFAULT_REQUEST_FILTERS: RequestFilters = {
  status: "open",
  types: [],
  assignee: null,
  requester: null,
  placement: null,
}

export type ParsedRequestFilters = { ok: true; filters: RequestFilters } | { ok: false; error: string }

// Person ids are cuids; this only keeps junk out of the query, it isn't a lookup.
const PERSON_ID = /^[A-Za-z0-9_-]{1,64}$/

function list(raw: string | null): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)
}

/**
 * Read filters from a query string. Strict: any unknown value is an error, so
 * the API can 400 and the page can fall back to the defaults. Duplicates in a
 * list are dropped; an empty parameter means "any".
 */
export function parseRequestFilters(params: URLSearchParams): ParsedRequestFilters {
  const filters: RequestFilters = { ...DEFAULT_REQUEST_FILTERS, types: [] }

  const status = list(params.get("status"))
  if (status.length === 1 && (status[0] === "open" || status[0] === "closed")) {
    filters.status = status[0]
  } else if (status.length > 0) {
    const bad = status.filter((s) => !(REQUEST_STATUSES as readonly string[]).includes(s))
    if (bad.length > 0) return { ok: false, error: `Unknown status: ${bad.join(", ")}` }
    filters.status = [...new Set(status)] as VisualStatus[]
  }

  const types = list(params.get("type"))
  const badTypes = types.filter((t) => !(VISUAL_TYPES as readonly string[]).includes(t))
  if (badTypes.length > 0) return { ok: false, error: `Unknown type: ${badTypes.join(", ")}` }
  filters.types = [...new Set(types)] as VisualTypeValue[]

  const assignee = params.get("assignee")?.trim() || null
  if (assignee !== null && assignee !== "me" && assignee !== "none" && !PERSON_ID.test(assignee)) {
    return { ok: false, error: "assignee must be a person id, me, or none" }
  }
  filters.assignee = assignee

  const requester = params.get("requester")?.trim() || null
  // "none" would pass the id pattern, but every request has a requester.
  if (requester !== null && requester !== "me" && (requester === "none" || !PERSON_ID.test(requester))) {
    return { ok: false, error: "requester must be a person id or me" }
  }
  filters.requester = requester

  const placement = params.get("placement")?.trim() || null
  if (placement !== null && placement !== "placed" && placement !== "unplaced") {
    return { ok: false, error: "placement must be placed or unplaced" }
  }
  filters.placement = placement

  return { ok: true, filters }
}

/** The query string for `filters`, leaving out defaults so the plain page URL stays plain. No leading "?". */
export function requestFiltersToQuery(filters: RequestFilters): string {
  const params = new URLSearchParams()
  if (filters.status !== "open") {
    params.set("status", typeof filters.status === "string" ? filters.status : filters.status.join(","))
  }
  if (filters.types.length > 0) params.set("type", filters.types.join(","))
  if (filters.assignee) params.set("assignee", filters.assignee)
  if (filters.requester) params.set("requester", filters.requester)
  if (filters.placement) params.set("placement", filters.placement)
  return params.toString()
}

/** Whether these are the plain dashboard's filters (nothing to clear). */
export function isDefaultFilters(filters: RequestFilters): boolean {
  return requestFiltersToQuery(filters) === ""
}

/** A status chip on the dashboard: Open, each status, or All closed. */
export type StatusChip = "open" | "closed" | VisualStatus

export function isStatusChipActive(filters: RequestFilters, chip: StatusChip): boolean {
  if (chip === "open" || chip === "closed") return filters.status === chip
  return Array.isArray(filters.status) && filters.status.includes(chip)
}

/**
 * Click a status chip. Open and All closed replace the selection (clicking an
 * active All closed goes back to Open). A single status toggles in or out of
 * an explicit list, starting a fresh list from Open or All closed; emptying
 * the list goes back to Open. Lists stay in lifecycle order so URLs are stable.
 */
export function toggleStatusChip(filters: RequestFilters, chip: StatusChip): RequestFilters {
  if (chip === "open") return { ...filters, status: "open" }
  if (chip === "closed") return { ...filters, status: filters.status === "closed" ? "open" : "closed" }
  const current = Array.isArray(filters.status) ? filters.status : []
  const next = current.includes(chip) ? current.filter((s) => s !== chip) : [...current, chip]
  if (next.length === 0) return { ...filters, status: "open" }
  return { ...filters, status: REQUEST_STATUSES.filter((s) => next.includes(s)) }
}

/** Click a type chip: toggles it in or out; none selected means every type. */
export function toggleTypeFilter(filters: RequestFilters, type: VisualTypeValue): RequestFilters {
  const next = filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type]
  return { ...filters, types: VISUAL_TYPES.filter((t) => next.includes(t)) }
}

export interface RequestListContext {
  /** `session.user.personId`; null for an unlinked account. */
  personId: string | null
  now: Date
}

/**
 * The Prisma `where` for these filters, or null when the answer is known to be
 * empty (an unlinked account asking for "me"). PLANNED rows are never listed:
 * the dashboard is requests, not credits. Closed statuses only count when
 * updated within CLOSED_REQUEST_WINDOW_DAYS; open ones always count.
 */
export function requestListWhere(filters: RequestFilters, ctx: RequestListContext): Prisma.VisualWhereInput | null {
  const statuses: readonly VisualStatus[] =
    filters.status === "open" ? OPEN_REQUEST_STATUSES
    : filters.status === "closed" ? TERMINAL_STATUSES
    : filters.status.length > 0 ? filters.status
    : REQUEST_STATUSES

  const open = statuses.filter((s) => !isTerminalStatus(s))
  const closed = statuses.filter((s) => isTerminalStatus(s))
  const cutoff = new Date(ctx.now.getTime() - CLOSED_REQUEST_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const statusClauses: Prisma.VisualWhereInput[] = []
  if (open.length > 0) statusClauses.push({ status: { in: open } })
  if (closed.length > 0) statusClauses.push({ status: { in: closed }, updatedAt: { gte: cutoff } })

  const and: Prisma.VisualWhereInput[] = [
    statusClauses.length === 1 ? statusClauses[0] : { OR: statusClauses },
  ]

  if (filters.types.length > 0) and.push({ type: { in: filters.types } })

  if (filters.assignee === "none") {
    and.push({ personId: null })
  } else if (filters.assignee) {
    const id = filters.assignee === "me" ? ctx.personId : filters.assignee
    if (!id) return null
    and.push({ personId: id })
  }

  if (filters.requester) {
    const id = filters.requester === "me" ? ctx.personId : filters.requester
    if (!id) return null
    and.push({ requestedById: id })
  }

  if (filters.placement === "placed") and.push({ storyId: { not: null } })
  if (filters.placement === "unplaced") and.push({ storyId: null })

  return { AND: and }
}

/** GET /api/visuals's whole query step: parse, then build the where (null = empty result). */
export function parseRequestListQuery(
  params: URLSearchParams,
  ctx: RequestListContext,
): { ok: true; where: Prisma.VisualWhereInput | null } | { ok: false; error: string } {
  const parsed = parseRequestFilters(params)
  if (!parsed.ok) return parsed
  return { ok: true, where: requestListWhere(parsed.filters, ctx) }
}

/** The fields compareRequests reads. Dates may arrive as strings from JSON. */
export interface SortableRequest {
  id: string
  priority: string
  deadline: Date | string | null
  createdAt: Date | string
}

function time(value: Date | string): number {
  return (typeof value === "string" ? new Date(value) : value).getTime()
}

/**
 * Dashboard order: URGENT first, then the nearest deadline (none last), then
 * the oldest filed, then id so the order is stable across polls. Done in code
 * rather than orderBy so it doesn't depend on "URGENT" sorting after "NORMAL".
 */
export function compareRequests(a: SortableRequest, b: SortableRequest): number {
  const urgent = Number(b.priority === "URGENT") - Number(a.priority === "URGENT")
  if (urgent !== 0) return urgent
  if (a.deadline && b.deadline) {
    const d = time(a.deadline) - time(b.deadline)
    if (d !== 0) return d
  } else if (a.deadline || b.deadline) {
    return a.deadline ? -1 : 1
  }
  const c = time(a.createdAt) - time(b.createdAt)
  if (c !== 0) return c
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
