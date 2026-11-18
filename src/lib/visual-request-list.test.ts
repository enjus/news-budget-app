import { describe, it, expect } from "vitest"
import {
  CLOSED_REQUEST_WINDOW_DAYS,
  DEFAULT_REQUEST_FILTERS,
  compareRequests,
  parseRequestFilters,
  parseRequestListQuery,
  requestFiltersToQuery,
  requestListWhere,
  isDefaultFilters,
  isStatusChipActive,
  toggleStatusChip,
  toggleTypeFilter,
  type RequestFilters,
  type SortableRequest,
} from "./visual-request-list"

const q = (s: string) => new URLSearchParams(s)
const NOW = new Date("2026-11-17T20:00:00.000Z")
const CUTOFF = new Date(NOW.getTime() - CLOSED_REQUEST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
const ctx = { personId: "person-me", now: NOW }

function filters(s: string): RequestFilters {
  const parsed = parseRequestFilters(q(s))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.filters
}

describe("parseRequestFilters", () => {
  it("defaults to open requests of every type, anyone, anywhere", () => {
    expect(filters("")).toEqual(DEFAULT_REQUEST_FILTERS)
    expect(filters("status=&type=&assignee=&placement=")).toEqual(DEFAULT_REQUEST_FILTERS)
  })

  it("reads open, closed, and explicit status lists, dropping duplicates", () => {
    expect(filters("status=open").status).toBe("open")
    expect(filters("status=closed").status).toBe("closed")
    expect(filters("status=REQUESTED, DECLINED,REQUESTED").status).toEqual(["REQUESTED", "DECLINED"])
  })

  it("reads types, assignee, requester and placement", () => {
    expect(filters("type=PHOTO,MAP&assignee=me&requester=ck123&placement=unplaced")).toEqual({
      status: "open",
      types: ["PHOTO", "MAP"],
      assignee: "me",
      requester: "ck123",
      placement: "unplaced",
    })
    expect(filters("assignee=none").assignee).toBe("none")
  })

  it("rejects unknown values", () => {
    for (const bad of [
      "status=PLANNED", // credits are never listed
      "status=open,closed",
      "status=BOGUS",
      "type=HOLOGRAM",
      "assignee=a b",
      "requester=none", // "none" is for assignees only
      "placement=somewhere",
    ]) {
      expect(parseRequestFilters(q(bad)).ok, bad).toBe(false)
    }
  })
})

describe("requestFiltersToQuery", () => {
  it("leaves defaults out so the plain page URL stays plain", () => {
    expect(requestFiltersToQuery(DEFAULT_REQUEST_FILTERS)).toBe("")
  })

  it("round-trips through parseRequestFilters", () => {
    const cases: RequestFilters[] = [
      { status: "closed", types: [], assignee: null, requester: null, placement: null },
      { status: ["ASSIGNED", "DELIVERED"], types: ["GRAPHIC"], assignee: "none", requester: "me", placement: "placed" },
      { status: "open", types: ["PHOTO", "VIDEO"], assignee: "ck123", requester: null, placement: "unplaced" },
    ]
    for (const f of cases) expect(filters(requestFiltersToQuery(f))).toEqual(f)
  })
})

describe("requestListWhere", () => {
  it("lists open requests with no date window by default", () => {
    expect(requestListWhere(DEFAULT_REQUEST_FILTERS, ctx)).toEqual({
      AND: [{ status: { in: ["REQUESTED", "ASSIGNED", "IN_PROGRESS"] } }],
    })
  })

  it("windows closed statuses to the last 90 days", () => {
    expect(requestListWhere(filters("status=closed"), ctx)).toEqual({
      AND: [{ status: { in: ["DELIVERED", "DECLINED", "CANCELED"] }, updatedAt: { gte: CUTOFF } }],
    })
  })

  it("applies the window to the closed part of a mixed list only", () => {
    expect(requestListWhere(filters("status=ASSIGNED,DELIVERED"), ctx)).toEqual({
      AND: [{ OR: [
        { status: { in: ["ASSIGNED"] } },
        { status: { in: ["DELIVERED"] }, updatedAt: { gte: CUTOFF } },
      ] }],
    })
  })

  it("never includes PLANNED, whatever the filter", () => {
    for (const s of ["", "status=open", "status=closed", "status=REQUESTED,CANCELED"]) {
      expect(JSON.stringify(requestListWhere(filters(s), ctx)), s).not.toContain("PLANNED")
    }
  })

  it("filters by type, assignee, requester and placement", () => {
    const where = requestListWhere(filters("type=PHOTO&assignee=ck1&requester=ck2&placement=placed"), ctx)
    expect(where?.AND).toEqual([
      { status: { in: ["REQUESTED", "ASSIGNED", "IN_PROGRESS"] } },
      { type: { in: ["PHOTO"] } },
      { personId: "ck1" },
      { requestedById: "ck2" },
      { storyId: { not: null } },
    ])
    expect(requestListWhere(filters("assignee=none&placement=unplaced"), ctx)?.AND).toEqual([
      { status: { in: ["REQUESTED", "ASSIGNED", "IN_PROGRESS"] } },
      { personId: null },
      { storyId: null },
    ])
  })

  it("resolves me to the viewer's person", () => {
    expect(requestListWhere(filters("assignee=me&requester=me"), ctx)?.AND).toContainEqual({ personId: "person-me" })
    expect(requestListWhere(filters("assignee=me&requester=me"), ctx)?.AND).toContainEqual({ requestedById: "person-me" })
  })

  it("returns null (an empty list, not an error) for me on an unlinked account", () => {
    const unlinked = { personId: null, now: NOW }
    expect(requestListWhere(filters("assignee=me"), unlinked)).toBeNull()
    expect(requestListWhere(filters("requester=me"), unlinked)).toBeNull()
    expect(requestListWhere(filters("assignee=none"), unlinked)).not.toBeNull()
  })
})

describe("parseRequestListQuery", () => {
  it("passes parse errors through for a 400", () => {
    expect(parseRequestListQuery(q("type=HOLOGRAM"), ctx)).toEqual({ ok: false, error: "Unknown type: HOLOGRAM" })
  })

  it("returns the where for a good query", () => {
    const result = parseRequestListQuery(q("placement=unplaced"), ctx)
    expect(result.ok && result.where?.AND).toContainEqual({ storyId: null })
  })
})

describe("compareRequests", () => {
  const r = (id: string, over: Partial<SortableRequest> = {}): SortableRequest => ({
    id,
    priority: "NORMAL",
    deadline: null,
    createdAt: "2026-11-10T00:00:00.000Z",
    ...over,
  })
  const order = (rows: SortableRequest[]) => [...rows].sort(compareRequests).map((x) => x.id)

  it("puts urgent requests first", () => {
    expect(order([r("normal", { deadline: "2026-11-18T00:00:00.000Z" }), r("urgent", { priority: "URGENT" })])).toEqual(["urgent", "normal"])
  })

  it("then the nearest deadline, with no deadline last", () => {
    expect(order([
      r("none"),
      r("later", { deadline: "2026-11-25T00:00:00.000Z" }),
      r("sooner", { deadline: new Date("2026-11-19T00:00:00.000Z") }),
    ])).toEqual(["sooner", "later", "none"])
  })

  it("then the oldest filed, then id, so the order is stable across polls", () => {
    expect(order([
      r("b", { createdAt: "2026-11-01T00:00:00.000Z" }),
      r("new", { createdAt: "2026-11-12T00:00:00.000Z" }),
      r("a", { createdAt: "2026-11-01T00:00:00.000Z" }),
    ])).toEqual(["a", "b", "new"])
  })
})

describe("dashboard chips", () => {
  const D = DEFAULT_REQUEST_FILTERS

  it("knows the default view", () => {
    expect(isDefaultFilters(D)).toBe(true)
    expect(isDefaultFilters({ ...D, placement: "unplaced" })).toBe(false)
    expect(isDefaultFilters({ ...D, status: "closed" })).toBe(false)
  })

  it("Open and All closed replace the selection; clicking an active All closed goes back to Open", () => {
    expect(toggleStatusChip({ ...D, status: ["ASSIGNED"] }, "open").status).toBe("open")
    expect(toggleStatusChip(D, "closed").status).toBe("closed")
    expect(toggleStatusChip({ ...D, status: "closed" }, "closed").status).toBe("open")
    expect(toggleStatusChip({ ...D, status: ["REQUESTED"] }, "closed").status).toBe("closed")
  })

  it("a single status starts a fresh list from Open or All closed", () => {
    expect(toggleStatusChip(D, "REQUESTED").status).toEqual(["REQUESTED"])
    expect(toggleStatusChip({ ...D, status: "closed" }, "DECLINED").status).toEqual(["DECLINED"])
  })

  it("toggles statuses in and out, in lifecycle order, back to Open when empty", () => {
    const a = toggleStatusChip(D, "DELIVERED")
    const b = toggleStatusChip(a, "REQUESTED")
    expect(b.status).toEqual(["REQUESTED", "DELIVERED"])
    expect(toggleStatusChip(b, "DELIVERED").status).toEqual(["REQUESTED"])
    expect(toggleStatusChip(toggleStatusChip(b, "DELIVERED"), "REQUESTED").status).toBe("open")
  })

  it("marks the active chips", () => {
    expect(isStatusChipActive(D, "open")).toBe(true)
    expect(isStatusChipActive(D, "REQUESTED")).toBe(false)
    const f = { ...D, status: ["ASSIGNED" as const] }
    expect(isStatusChipActive(f, "ASSIGNED")).toBe(true)
    expect(isStatusChipActive(f, "open")).toBe(false)
    expect(isStatusChipActive({ ...D, status: "closed" }, "closed")).toBe(true)
  })

  it("toggles types, in a fixed order, with none meaning every type", () => {
    const a = toggleTypeFilter(D, "VIDEO")
    const b = toggleTypeFilter(a, "PHOTO")
    expect(b.types).toEqual(["PHOTO", "VIDEO"])
    expect(toggleTypeFilter(toggleTypeFilter(b, "PHOTO"), "VIDEO").types).toEqual([])
  })

  it("leaves the other filters alone", () => {
    const f: RequestFilters = { ...D, assignee: "me", placement: "unplaced" }
    expect(toggleStatusChip(f, "closed")).toMatchObject({ assignee: "me", placement: "unplaced" })
    expect(toggleTypeFilter(f, "MAP")).toMatchObject({ assignee: "me", placement: "unplaced" })
  })
})
