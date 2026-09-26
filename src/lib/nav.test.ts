import { describe, it, expect } from "vitest"
import { sectionForPath, isTabActive, navSections } from "./nav"

describe("sectionForPath", () => {
  it("prefers the longest matching prefix regardless of list order", () => {
    expect(sectionForPath("/budget/pitches")).toBe("pitches")
    expect(sectionForPath("/budget/pitches/abc")).toBe("pitches")
    expect(sectionForPath("/budget/daily/2026-09-26")).toBe("budget")
  })

  it("assigns Budget's non-/budget routes to Budget", () => {
    for (const p of ["/teams", "/me", "/stories/abc", "/videos/new"]) {
      expect(sectionForPath(p)).toBe("budget")
    }
  })

  it("keeps /schedule/me in Schedule, not Budget's /me", () => {
    expect(sectionForPath("/schedule/me")).toBe("schedule")
  })

  it("matches whole path segments only", () => {
    expect(sectionForPath("/media")).toBeNull()
    expect(sectionForPath("/budgeting")).toBeNull()
  })

  it("returns null for routes outside any section", () => {
    for (const p of ["/", "/settings", "/admin/teams", "/people/abc", "/login"]) {
      expect(sectionForPath(p)).toBeNull()
    }
  })
})

describe("navSections", () => {
  const ctx = { appRole: "PRODUCER", personId: null, teamsLabel: "Team" }

  it("lists sections in top-bar order", () => {
    expect(navSections(ctx).map((s) => s.id)).toEqual(["budget", "pitches", "schedule"])
  })

  it("hides role-gated Budget tabs for a producer without a linked person", () => {
    const budget = navSections(ctx).find((s) => s.id === "budget")!
    // PRODUCER can create content (so Me shows) but isn't admin or a team viewer.
    expect(budget.tabs.map((t) => t.label)).toEqual(["Daily", "Enterprise", "Shelved", "Me"])
  })

  it("shows Editions and the team label for an admin", () => {
    const budget = navSections({ ...ctx, appRole: "ADMIN", teamsLabel: "Metro" }).find((s) => s.id === "budget")!
    expect(budget.tabs.map((t) => t.label)).toEqual(["Daily", "Enterprise", "Editions", "Shelved", "Metro", "Me"])
  })

  it("shows Me for a viewer with a linked person even without create rights", () => {
    const budget = navSections({ ...ctx, appRole: "VIEWER", personId: "p1" }).find((s) => s.id === "budget")!
    expect(budget.tabs.map((t) => t.label)).toContain("Me")
  })
})

describe("isTabActive", () => {
  it("matches the tab's prefix at a segment boundary", () => {
    const daily = { label: "Daily", href: "/budget/daily", match: ["/budget/daily"] }
    expect(isTabActive("/budget/daily/2026-09-26", daily)).toBe(true)
    expect(isTabActive("/budget/dailyx", daily)).toBe(false)
  })
})
