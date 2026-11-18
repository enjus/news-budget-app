import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, it, expect, vi } from "vitest"
import { sectionForPath, isTabActive, navSections, sectionMetadata, sectionMatchPrefixes } from "./nav"

describe("sectionForPath", () => {
  it("prefers the longest matching prefix regardless of list order", () => {
    expect(sectionForPath("/budget/pitches")).toBe("pitches")
    expect(sectionForPath("/budget/pitches/abc")).toBe("pitches")
    expect(sectionForPath("/budget/daily/2026-09-26")).toBe("budget")
  })

  it("assigns Budget's non-/budget routes to Budget", () => {
    for (const p of ["/teams", "/me", "/people/abc", "/stories/abc", "/videos/new", "/tags/breaking-news"]) {
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
    for (const p of ["/", "/settings", "/login"]) {
      expect(sectionForPath(p)).toBeNull()
    }
  })

  it("assigns /admin routes to Admin", () => {
    expect(sectionForPath("/admin/teams")).toBe("admin")
    expect(sectionForPath("/admin/visual-requests")).toBe("admin")
  })

  it("assigns /requests routes to Requests", () => {
    for (const p of ["/requests", "/requests/new", "/requests/abc"]) {
      expect(sectionForPath(p)).toBe("requests")
    }
  })
})

describe("navSections", () => {
  const ctx = { appRole: "PRODUCER", personId: null, teamsLabel: "Team" }

  it("lists sections in top-bar order", () => {
    expect(navSections(ctx).map((s) => s.id)).toEqual(["budget", "pitches", "requests", "schedule", "admin"])
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

  it("always shows Pitches and Schedule in the top bar, for every role", () => {
    for (const appRole of ["VIEWER", "PRODUCER", "ADMIN"]) {
      const sections = navSections({ ...ctx, appRole })
      for (const id of ["pitches", "schedule"]) {
        const section = sections.find((s) => s.id === id)!
        expect(section.enabled).toBe(true)
        expect(section.inTopBar).toBe(true)
      }
    }
  })

  it("enables Admin only for admins, and never in the top bar", () => {
    const forRole = (appRole: string) => navSections({ ...ctx, appRole }).find((s) => s.id === "admin")!
    expect(forRole("PRODUCER").enabled).toBe(false)
    expect(forRole("ADMIN").enabled).toBe(true)
    expect(forRole("ADMIN").inTopBar).toBe(false)
    expect(forRole("ADMIN").tabs.map((t) => t.label)).toContain("People")
    expect(forRole("ADMIN").tabs).toContainEqual({
      label: "Visual requests",
      href: "/admin/visual-requests",
      match: ["/admin/visual-requests"],
    })
  })

  it("shows Me for a viewer with a linked person even without create rights", () => {
    const budget = navSections({ ...ctx, appRole: "VIEWER", personId: "p1" }).find((s) => s.id === "budget")!
    expect(budget.tabs.map((t) => t.label)).toContain("Me")
  })
})

// The Requests item depends on NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED, read once
// when features.ts loads, so each case reloads nav.ts with the env stubbed.
describe("Requests section", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function requestsFor(flag: string, appRole: string) {
    vi.stubEnv("NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED", flag)
    vi.resetModules()
    const nav = await import("./nav")
    return nav.navSections({ appRole, personId: null, teamsLabel: "Team" }).find((s) => s.id === "requests")!
  }

  it("is hidden for everyone while the flag is off", async () => {
    for (const role of ["VIEWER", "PRODUCER", "SUPERVISOR", "ADMIN"]) {
      expect((await requestsFor("false", role)).enabled, role).toBe(false)
    }
  })

  it("shows in the top bar for content creators once the flag is on", async () => {
    for (const role of ["PRODUCER", "SUPERVISOR", "MANAGING_PRODUCER", "LEADERSHIP", "ADMIN"]) {
      const section = await requestsFor("true", role)
      expect(section.enabled, role).toBe(true)
      expect(section.inTopBar).toBe(true)
      expect(section.href).toBe("/requests")
      expect(section.tabs).toEqual([])
    }
  })

  it("stays hidden for a viewer even with the flag on (the URL still works)", async () => {
    expect((await requestsFor("true", "VIEWER")).enabled).toBe(false)
  })
})

describe("isTabActive", () => {
  it("matches the tab's prefix at a segment boundary", () => {
    const daily = { label: "Daily", href: "/budget/daily", match: ["/budget/daily"] }
    expect(isTabActive("/budget/daily/2026-09-26", daily)).toBe(true)
    expect(isTabActive("/budget/dailyx", daily)).toBe(false)
  })
})

describe("sectionMetadata", () => {
  it("titles tabs Newsroom | <section label>", () => {
    expect(sectionMetadata("budget").title).toEqual({ absolute: "Newsroom | Budget" })
    expect(sectionMetadata("pitches").title).toEqual({ absolute: "Newsroom | Pitches" })
    expect(sectionMetadata("admin").title).toEqual({ absolute: "Newsroom | Admin" })
  })
})

// Tab titles come from layouts, not nav.ts, so check every match prefix has a
// layout (at or above it, route groups included) exporting its section's
// sectionMetadata(). Otherwise a new prefix silently gets the plain title.
describe("section layouts", () => {
  const appDir = path.resolve(__dirname, "../app")

  // The directory serving `segments`, looking through "(group)" folders.
  function routeDir(dir: string, segments: string[]): string | null {
    if (segments.length === 0) return dir
    const [head, ...rest] = segments
    if (existsSync(path.join(dir, head))) return routeDir(path.join(dir, head), rest)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\(.+\)$/.test(entry.name)) {
        const found = routeDir(path.join(dir, entry.name), segments)
        if (found) return found
      }
    }
    return null
  }

  // The section id of the nearest layout that calls sectionMetadata().
  function titledSection(dir: string): string | null {
    for (let d = dir; d.startsWith(appDir); d = path.dirname(d)) {
      const layout = path.join(d, "layout.tsx")
      if (!existsSync(layout)) continue
      const m = readFileSync(layout, "utf8").match(/sectionMetadata\("(\w+)"\)/)
      if (m) return m[1]
    }
    return null
  }

  for (const { id, prefixes } of sectionMatchPrefixes()) {
    for (const prefix of prefixes) {
      it(`${prefix} is titled as ${id}`, () => {
        const dir = routeDir(appDir, prefix.split("/").filter(Boolean))
        expect(dir, `no route folder for ${prefix}`).not.toBeNull()
        expect(titledSection(dir!)).toBe(id)
      })
    }
  }
})
