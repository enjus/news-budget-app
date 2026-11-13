import { describe, it, expect } from "vitest"
import {
  VISUAL_STATUSES,
  ACTIVE_STATUSES,
  CREDITED_STATUSES,
  NOTIFIABLE_STATUSES,
  TERMINAL_STATUSES,
  isVisualStatus,
  isActiveStatus,
  isCreditedStatus,
  isNotifiableStatus,
  canTransition,
  canActOnVisual,
  canBeAssigned,
  partitionVisualsForStoryDelete,
  parseDataUrl,
  DATA_URL_MAX_LENGTH,
  type VisualAction,
  type VisualActor,
  type VisualPermissionTarget,
} from "./visual-requests"

describe("status sets", () => {
  it("lists every status exactly once", () => {
    expect(new Set(VISUAL_STATUSES).size).toBe(VISUAL_STATUSES.length)
    expect(VISUAL_STATUSES).toHaveLength(7)
  })

  it("ACTIVE is everything except DECLINED and CANCELED", () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(
      VISUAL_STATUSES.filter((s) => s !== "DECLINED" && s !== "CANCELED").sort(),
    )
  })

  it("CREDITED is PLANNED and DELIVERED only", () => {
    expect([...CREDITED_STATUSES].sort()).toEqual(["DELIVERED", "PLANNED"])
  })

  it("NOTIFIABLE is ACTIVE minus REQUESTED", () => {
    expect([...NOTIFIABLE_STATUSES].sort()).toEqual(ACTIVE_STATUSES.filter((s) => s !== "REQUESTED").sort())
  })

  it("every set is a subset of the known statuses", () => {
    for (const set of [ACTIVE_STATUSES, CREDITED_STATUSES, NOTIFIABLE_STATUSES, TERMINAL_STATUSES]) {
      for (const s of set) expect(isVisualStatus(s)).toBe(true)
    }
  })

  it("membership helpers agree with the sets and treat unknown statuses as inert", () => {
    expect(isActiveStatus("REQUESTED")).toBe(true)
    expect(isActiveStatus("DECLINED")).toBe(false)
    expect(isCreditedStatus("DELIVERED")).toBe(true)
    expect(isCreditedStatus("ASSIGNED")).toBe(false)
    expect(isNotifiableStatus("ASSIGNED")).toBe(true)
    expect(isNotifiableStatus("REQUESTED")).toBe(false)
    for (const fn of [isActiveStatus, isCreditedStatus, isNotifiableStatus]) expect(fn("BOGUS")).toBe(false)
  })
})

describe("canTransition", () => {
  const legal: [string, string][] = [
    ["REQUESTED", "ASSIGNED"],
    ["REQUESTED", "DECLINED"],
    ["REQUESTED", "CANCELED"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["ASSIGNED", "DECLINED"],
    ["ASSIGNED", "CANCELED"],
    ["IN_PROGRESS", "DELIVERED"],
    ["IN_PROGRESS", "CANCELED"],
  ]

  it("allows exactly the legal transitions and no others", () => {
    for (const from of VISUAL_STATUSES) {
      for (const to of VISUAL_STATUSES) {
        const expected = legal.some(([f, t]) => f === from && t === to)
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected)
      }
    }
  })

  it("treats DELIVERED, DECLINED and CANCELED as terminal", () => {
    for (const from of ["DELIVERED", "DECLINED", "CANCELED"]) {
      for (const to of VISUAL_STATUSES) expect(canTransition(from, to)).toBe(false)
    }
  })

  it("gives PLANNED no transitions", () => {
    for (const to of VISUAL_STATUSES) expect(canTransition("PLANNED", to)).toBe(false)
  })

  it("rejects unknown statuses", () => {
    expect(canTransition("BOGUS", "ASSIGNED")).toBe(false)
    expect(canTransition("REQUESTED", "BOGUS")).toBe(false)
  })
})

describe("canActOnVisual", () => {
  const ME = "person-me"
  const OTHER = "person-other"
  const actor = (role: string, personId: string | null = ME): VisualActor => ({ role, personId })
  const visual = (status: string, over: Partial<VisualPermissionTarget> = {}): VisualPermissionTarget => ({
    status,
    personId: null,
    requestedById: OTHER,
    ...over,
  })

  describe("PLANNED keeps today's rules", () => {
    it("lets any content creator update, assign and delete", () => {
      for (const role of ["ADMIN", "LEADERSHIP", "MANAGING_PRODUCER", "SUPERVISOR", "PRODUCER"]) {
        for (const action of ["update", "assign", "delete"] as VisualAction[]) {
          expect(canActOnVisual(actor(role), visual("PLANNED"), action), `${role} ${action}`).toBe(true)
        }
      }
    })

    it("has no lifecycle actions", () => {
      for (const action of ["advance", "decline", "cancel"] as VisualAction[]) {
        expect(canActOnVisual(actor("ADMIN"), visual("PLANNED"), action)).toBe(false)
      }
    })
  })

  it("denies VIEWER everything, on every status", () => {
    for (const status of VISUAL_STATUSES) {
      for (const action of ["update", "assign", "advance", "decline", "cancel", "delete"] as VisualAction[]) {
        expect(canActOnVisual(actor("VIEWER"), visual(status, { personId: ME, requestedById: ME }), action)).toBe(false)
      }
    }
  })

  it("assign: elevated roles or the assignee", () => {
    const v = visual("ASSIGNED", { personId: ME })
    expect(canActOnVisual(actor("SUPERVISOR"), visual("REQUESTED"), "assign")).toBe(true)
    expect(canActOnVisual(actor("PRODUCER"), visual("REQUESTED"), "assign")).toBe(false)
    expect(canActOnVisual(actor("PRODUCER"), v, "assign")).toBe(true)
    expect(canActOnVisual(actor("PRODUCER", OTHER), v, "assign")).toBe(false)
  })

  it("advance: the assignee or elevated roles", () => {
    const v = visual("ASSIGNED", { personId: ME })
    expect(canActOnVisual(actor("PRODUCER"), v, "advance")).toBe(true)
    expect(canActOnVisual(actor("PRODUCER", OTHER), v, "advance")).toBe(false)
    expect(canActOnVisual(actor("MANAGING_PRODUCER", OTHER), v, "advance")).toBe(true)
  })

  it("decline: elevated roles only, even for the assignee or requester", () => {
    const v = visual("REQUESTED", { personId: ME, requestedById: ME })
    expect(canActOnVisual(actor("PRODUCER"), v, "decline")).toBe(false)
    expect(canActOnVisual(actor("SUPERVISOR"), v, "decline")).toBe(true)
  })

  it("cancel: the requester or admin access", () => {
    const v = visual("REQUESTED", { requestedById: ME })
    expect(canActOnVisual(actor("PRODUCER"), v, "cancel")).toBe(true)
    expect(canActOnVisual(actor("PRODUCER", OTHER), v, "cancel")).toBe(false)
    expect(canActOnVisual(actor("SUPERVISOR", OTHER), v, "cancel")).toBe(false) // elevated, not admin
    expect(canActOnVisual(actor("LEADERSHIP", OTHER), v, "cancel")).toBe(true)
  })

  it("delete: admin access, terminal statuses only", () => {
    for (const status of VISUAL_STATUSES.filter((s) => s !== "PLANNED")) {
      const terminal = (TERMINAL_STATUSES as readonly string[]).includes(status)
      expect(canActOnVisual(actor("ADMIN"), visual(status), "delete"), status).toBe(terminal)
      expect(canActOnVisual(actor("SUPERVISOR"), visual(status), "delete"), status).toBe(false)
    }
  })

  it("update: the requester or elevated roles", () => {
    const v = visual("REQUESTED", { requestedById: ME })
    expect(canActOnVisual(actor("PRODUCER"), v, "update")).toBe(true)
    expect(canActOnVisual(actor("PRODUCER", OTHER), v, "update")).toBe(false)
    expect(canActOnVisual(actor("SUPERVISOR", OTHER), v, "update")).toBe(true)
  })

  it("never matches a null personId against a null assignee or requester", () => {
    const v = visual("ASSIGNED", { personId: null, requestedById: null })
    const unlinked = actor("PRODUCER", null)
    expect(canActOnVisual(unlinked, v, "advance")).toBe(false)
    expect(canActOnVisual(unlinked, v, "cancel")).toBe(false)
    expect(canActOnVisual(unlinked, v, "update")).toBe(false)
  })
})

describe("canBeAssigned", () => {
  it("allows an active person", () => {
    expect(canBeAssigned({ isActive: true })).toEqual({ ok: true })
  })

  it("rejects a person who doesn't exist, with a clear message", () => {
    for (const missing of [null, undefined]) {
      const r = canBeAssigned(missing)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/doesn't exist/)
    }
  })

  it("rejects an inactive person, with a different message", () => {
    const r = canBeAssigned({ isActive: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/inactive/)
  })
})

describe("partitionVisualsForStoryDelete", () => {
  it("unplaces IN_PROGRESS and DELIVERED, deletes the rest", () => {
    const visuals = VISUAL_STATUSES.map((status) => ({ id: status, status }))
    const { deleteIds, unplaceIds } = partitionVisualsForStoryDelete(visuals)
    expect(unplaceIds.sort()).toEqual(["DELIVERED", "IN_PROGRESS"])
    expect(deleteIds.sort()).toEqual(["ASSIGNED", "CANCELED", "DECLINED", "PLANNED", "REQUESTED"])
  })

  it("deletes rows with an unknown status and handles an empty list", () => {
    expect(partitionVisualsForStoryDelete([{ id: "x", status: "BOGUS" }])).toEqual({ deleteIds: ["x"], unplaceIds: [] })
    expect(partitionVisualsForStoryDelete([])).toEqual({ deleteIds: [], unplaceIds: [] })
  })
})

describe("parseDataUrl", () => {
  const ok = (input: string | null | undefined) => {
    const r = parseDataUrl(input)
    if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
    return r.value
  }

  it("accepts normal https links", () => {
    expect(ok("https://contoso.sharepoint.com/:x:/s/news/abc123?e=xyz")).toBe(
      "https://contoso.sharepoint.com/:x:/s/news/abc123?e=xyz",
    )
    expect(ok("https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0")).toBe(
      "https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0",
    )
  })

  it("accepts an uppercase scheme and normalizes it", () => {
    expect(ok("HTTPS://Example.com/Data")).toBe("https://example.com/Data")
  })

  it("trims surrounding whitespace", () => {
    expect(ok("  https://example.com/a  ")).toBe("https://example.com/a")
  })

  it("maps empty, whitespace and nullish input to null", () => {
    expect(ok("")).toBeNull()
    expect(ok("   ")).toBeNull()
    expect(ok(null)).toBeNull()
    expect(ok(undefined)).toBeNull()
  })

  it("rejects other schemes", () => {
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "mailto:a@b.com",
    ]) {
      expect(parseDataUrl(bad).ok, bad).toBe(false)
    }
  })

  it("rejects protocol-relative and scheme-less input", () => {
    for (const bad of ["//example.com/x", "example.com/x", "/relative/path", "www.example.com"]) {
      expect(parseDataUrl(bad).ok, bad).toBe(false)
    }
  })

  it("rejects forms the URL parser would forgive", () => {
    for (const bad of ["https:example.com", "https:/example.com", "https:\\\\example.com"]) {
      expect(parseDataUrl(bad).ok, bad).toBe(false)
    }
  })

  it("rejects credentials in the URL", () => {
    for (const bad of ["https://user:pass@example.com", "https://user@example.com", "https://:pass@example.com"]) {
      expect(parseDataUrl(bad).ok, bad).toBe(false)
    }
  })

  it("rejects input over the length cap but allows exactly the cap", () => {
    const prefix = "https://example.com/"
    expect(parseDataUrl(prefix + "a".repeat(DATA_URL_MAX_LENGTH - prefix.length)).ok).toBe(true)
    expect(parseDataUrl(prefix + "a".repeat(DATA_URL_MAX_LENGTH - prefix.length + 1)).ok).toBe(false)
  })

  it("rejects non-URLs", () => {
    for (const bad of ["not a url", "https://", "https://exa mple.com"]) {
      expect(parseDataUrl(bad).ok, bad).toBe(false)
    }
  })
})
