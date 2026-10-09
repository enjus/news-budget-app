import { PITCHES_ENABLED, SCHEDULE_ENABLED } from "@/lib/features"
import { hasAdminAccess, canViewMyTeams, canCreateContent, canViewPeople } from "@/lib/utils"

// Single source of truth for the two-level nav: TopNav renders the sections,
// SectionTabNav renders the active section's tabs, and the mobile menu
// renders both. Budget is one tool among several (Schedule, Pitches), so
// its old top-level links (Daily, Enterprise, …) live here as tabs.

export type NavSectionId = "budget" | "pitches" | "schedule" | "admin"

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
  /** False for sections reached only from the menus (Admin), never as a top-bar link. */
  inTopBar: boolean
  tabs: NavTab[]
}

interface SectionDef extends Omit<NavSection, "tabs" | "enabled"> {
  match: string[]
  enabled: boolean | ((ctx: NavContext) => boolean)
  /** Returns only the tabs this viewer should see. */
  tabs: (ctx: NavContext) => NavTab[]
}

// Listed in top-bar display order. Order doesn't affect matching:
// sectionForPath() picks the most specific (longest) matching prefix, so
// /budget/pitches belongs to Pitches even though Budget also claims /budget.
const SECTIONS: SectionDef[] = [
  {
    id: "budget",
    label: "Budget",
    // /budget honors the user's defaultView preference (src/app/budget/page.tsx).
    href: "/budget",
    match: ["/budget", "/teams", "/me", "/people", "/stories", "/videos"],
    enabled: true,
    inTopBar: true,
    tabs: (ctx) => [
      // /budget/daily redirects server-side to today, so a tab left open
      // past midnight still lands on the current date.
      { label: "Daily", href: "/budget/daily", match: ["/budget/daily"] },
      { label: "Enterprise", href: "/budget/enterprise", match: ["/budget/enterprise"] },
      ...(hasAdminAccess(ctx.appRole)
        ? [{ label: "Editions", href: "/budget/edition", match: ["/budget/edition"] }]
        : []),
      { label: "Shelved", href: "/budget/shelved", match: ["/budget/shelved"] },
      ...(canViewMyTeams(ctx.appRole)
        ? [{ label: ctx.teamsLabel, href: "/teams", match: ["/teams"] }]
        : []),
      ...(canViewPeople(ctx.appRole)
        ? [{ label: "People", href: "/people", match: ["/people"] }]
        : []),
      ...(canCreateContent(ctx.appRole) || ctx.personId
        ? [{ label: "Me", href: "/me", match: ["/me"] }]
        : []),
    ],
  },
  {
    id: "pitches",
    label: "Pitches",
    href: "/budget/pitches",
    match: ["/budget/pitches"],
    enabled: PITCHES_ENABLED,
    inTopBar: true,
    tabs: () => [],
  },
  {
    id: "schedule",
    label: "Schedule",
    href: "/schedule/today",
    match: ["/schedule"],
    enabled: SCHEDULE_ENABLED,
    inTopBar: true,
    tabs: () => [
      { label: "Today", href: "/schedule/today", match: ["/schedule/today"] },
      { label: "Me", href: "/schedule/me", match: ["/schedule/me"] },
      { label: "Teams", href: "/schedule/teams", match: ["/schedule/teams"] },
      { label: "Shifts", href: "/schedule/shifts", match: ["/schedule/shifts"] },
    ],
  },
  {
    // Reached from the user menu (desktop) or its own group in the mobile
    // menu; the tabs give admin pages a sub-nav. Access is enforced by
    // src/app/admin/layout.tsx, not here.
    id: "admin",
    label: "Admin",
    href: "/admin/users",
    match: ["/admin"],
    enabled: (ctx) => hasAdminAccess(ctx.appRole),
    inTopBar: false,
    tabs: () => [
      { label: "Users", href: "/admin/users", match: ["/admin/users"] },
      { label: "Teams", href: "/admin/teams", match: ["/admin/teams"] },
      { label: "Tags", href: "/admin/tags", match: ["/admin/tags"] },
      { label: "Calendar", href: "/admin/calendar", match: ["/admin/calendar"] },
    ],
  },
]

export function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Every section in display order, with tabs filtered for the viewer. */
export function navSections(ctx: NavContext): NavSection[] {
  return SECTIONS.map((def) => ({
    id: def.id,
    label: def.label,
    href: def.href,
    enabled: typeof def.enabled === "function" ? def.enabled(ctx) : def.enabled,
    inTopBar: def.inTopBar,
    tabs: def.tabs(ctx),
  }))
}

/** The section owning `pathname` (longest matching prefix wins), whether or not it's enabled — or null (settings, login…). */
export function sectionForPath(pathname: string): NavSectionId | null {
  let best: { id: NavSectionId; length: number } | null = null
  for (const section of SECTIONS) {
    for (const prefix of section.match) {
      if (matchesPath(pathname, prefix) && (!best || prefix.length > best.length)) {
        best = { id: section.id, length: prefix.length }
      }
    }
  }
  return best?.id ?? null
}

export function isTabActive(pathname: string, tab: NavTab): boolean {
  return tab.match.some((p) => matchesPath(pathname, p))
}

export interface ExternalNavLink {
  label: string
  href: string
}

/**
 * Links out to tools that live outside this app (different origin path,
 * no routing/active-state here). Rendered in top-bar display order after
 * the sections, both desktop and mobile.
 */
export const EXTERNAL_NAV_LINKS: ExternalNavLink[] = [
  { label: "BookStack", href: "/bookstack" },
]
