import { PITCHES_ENABLED, SCHEDULE_ENABLED } from "@/lib/features"
import { todayString, hasAdminAccess, canViewMyTeams, canCreateContent } from "@/lib/utils"

// Single source of truth for the two-level nav: TopNav renders the sections,
// SectionTabNav renders the active section's tabs, and the mobile menu
// renders both. Budget is one tool among several (Schedule, Pitches), so
// its old top-level links (Daily, Enterprise, …) live here as tabs.

export type NavSectionId = "budget" | "pitches" | "schedule"

export interface NavContext {
  appRole: string
  personId: string | null | undefined
  /** Team tab label — the team's name when the viewer is on exactly one. */
  teamsLabel: string
}

export interface NavTab {
  label: string
  href: string
  /** Path prefixes that mark this tab active. */
  match: string[]
}

export interface NavSection {
  id: NavSectionId
  label: string
  href: string
  /** Whether the section appears in the top bar/menu. Its sub-nav still renders on its routes either way. */
  enabled: boolean
  tabs: NavTab[]
}

interface TabDef extends NavTab {
  show?: (ctx: NavContext) => boolean
}

interface SectionDef extends Omit<NavSection, "tabs"> {
  match: string[]
  tabs: (ctx: NavContext) => TabDef[]
}

// Order matters for matching: Pitches lives under /budget, so it must be
// checked before Budget.
const SECTIONS: SectionDef[] = [
  {
    id: "pitches",
    label: "Pitches",
    href: "/budget/pitches",
    match: ["/budget/pitches"],
    enabled: PITCHES_ENABLED,
    tabs: () => [],
  },
  {
    id: "schedule",
    label: "Schedule",
    href: "/schedule/today",
    match: ["/schedule"],
    enabled: SCHEDULE_ENABLED,
    tabs: () => [
      { label: "Today", href: "/schedule/today", match: ["/schedule/today"] },
      { label: "Me", href: "/schedule/me", match: ["/schedule/me"] },
      { label: "Teams", href: "/schedule/teams", match: ["/schedule/teams"] },
      { label: "Shifts", href: "/schedule/shifts", match: ["/schedule/shifts"] },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    // "/" honors the user's defaultView preference (src/app/page.tsx).
    href: "/",
    match: ["/budget", "/teams", "/me", "/stories", "/videos"],
    enabled: true,
    tabs: (ctx) => [
      { label: "Daily", href: `/budget/daily/${todayString()}`, match: ["/budget/daily"] },
      { label: "Enterprise", href: "/budget/enterprise", match: ["/budget/enterprise"] },
      { label: "Editions", href: "/budget/edition", match: ["/budget/edition"], show: (c) => hasAdminAccess(c.appRole) },
      { label: "Shelved", href: "/budget/shelved", match: ["/budget/shelved"] },
      { label: ctx.teamsLabel, href: "/teams", match: ["/teams"], show: (c) => canViewMyTeams(c.appRole) },
      { label: "Me", href: "/me", match: ["/me"], show: (c) => canCreateContent(c.appRole) || !!c.personId },
    ],
  },
]

// Top-bar display order (differs from match order above).
const DISPLAY_ORDER: NavSectionId[] = ["budget", "pitches", "schedule"]

export function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function build(def: SectionDef, ctx: NavContext): NavSection {
  const tabs = def.tabs(ctx)
    .filter((t) => !t.show || t.show(ctx))
    .map(({ label, href, match }) => ({ label, href, match }))
  return { id: def.id, label: def.label, href: def.href, enabled: def.enabled, tabs }
}

/** Every section in display order, with tabs filtered for the viewer. */
export function navSections(ctx: NavContext): NavSection[] {
  return DISPLAY_ORDER.map((id) => build(SECTIONS.find((s) => s.id === id)!, ctx))
}

/** The section owning `pathname`, whether or not it's enabled — or null (admin, settings, people…). */
export function sectionForPath(pathname: string): NavSectionId | null {
  return SECTIONS.find((s) => s.match.some((p) => matchesPath(pathname, p)))?.id ?? null
}

export function isTabActive(pathname: string, tab: NavTab): boolean {
  return tab.match.some((p) => matchesPath(pathname, p))
}
