import { describe, it, expect } from "vitest"
import {
  canEditRosterProfile,
  hasNotifiableTeam,
  isNotifiablePerson,
  classifyContentItems,
  itemDateStr,
  formatBudgetLineCopy,
  dedupeVisualCredits,
  placedVisuals,
  type DatedContentItem,
} from "./utils"
import type { StoryListItem } from "@/types"

function item(overrides: Partial<DatedContentItem> & { slug: string }): DatedContentItem {
  return {
    onlinePubDate: null,
    onlinePubDateTBD: true,
    ...overrides,
  }
}

const TODAY = "2026-09-08"

describe("itemDateStr", () => {
  it("returns null when onlinePubDateTBD is true, regardless of onlinePubDate", () => {
    expect(itemDateStr({ onlinePubDate: "2026-09-08T07:30:00.000Z", onlinePubDateTBD: true })).toBeNull()
  })

  it("returns null when onlinePubDate is null, even if onlinePubDateTBD is false", () => {
    // Shouldn't occur through the API (requirePubDateField enforces the pairing),
    // but legacy/out-of-band data can still have it — see /api/people/[id]/content.
    expect(itemDateStr({ onlinePubDate: null, onlinePubDateTBD: false })).toBeNull()
  })

  it("reads the date as newsroom-time-encoded-as-UTC, not local time", () => {
    expect(itemDateStr({ onlinePubDate: "2026-09-08T23:30:00.000Z", onlinePubDateTBD: false })).toBe("2026-09-08")
  })
})

describe("classifyContentItems", () => {
  it("buckets a TBD-flagged item as tbd", () => {
    const { tbd, upcoming, past } = classifyContentItems(
      [item({ slug: "A", onlinePubDateTBD: true, onlinePubDate: null })],
      TODAY
    )
    expect(tbd).toHaveLength(1)
    expect(upcoming).toHaveLength(0)
    expect(past).toHaveLength(0)
  })

  it("buckets a null-date item as tbd even when onlinePubDateTBD is false", () => {
    // The edge case behind /api/people/[id]/content's capped-mode fix: this
    // item must not be silently dropped by either the upcoming or past query.
    const { tbd } = classifyContentItems(
      [item({ slug: "A", onlinePubDateTBD: false, onlinePubDate: null })],
      TODAY
    )
    expect(tbd).toHaveLength(1)
  })

  it("treats today as upcoming, not past", () => {
    const { upcoming, past } = classifyContentItems(
      [item({ slug: "A", onlinePubDateTBD: false, onlinePubDate: `${TODAY}T09:00:00.000Z` })],
      TODAY
    )
    expect(upcoming).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  it("sorts upcoming ascending (soonest first)", () => {
    const { upcoming } = classifyContentItems(
      [
        item({ slug: "LATER", onlinePubDateTBD: false, onlinePubDate: "2026-12-01T09:00:00.000Z" }),
        item({ slug: "SOONER", onlinePubDateTBD: false, onlinePubDate: "2026-09-09T09:00:00.000Z" }),
      ],
      TODAY
    )
    expect(upcoming.map((i) => i.slug)).toEqual(["SOONER", "LATER"])
  })

  it("sorts past descending (most recent first)", () => {
    const { past } = classifyContentItems(
      [
        item({ slug: "OLDER", onlinePubDateTBD: false, onlinePubDate: "2026-01-01T09:00:00.000Z" }),
        item({ slug: "NEWER", onlinePubDateTBD: false, onlinePubDate: "2026-09-01T09:00:00.000Z" }),
      ],
      TODAY
    )
    expect(past.map((i) => i.slug)).toEqual(["NEWER", "OLDER"])
  })

  it("sorts tbd alphabetically by slug", () => {
    const { tbd } = classifyContentItems(
      [
        item({ slug: "ZEBRA", onlinePubDateTBD: true, onlinePubDate: null }),
        item({ slug: "APPLE", onlinePubDateTBD: true, onlinePubDate: null }),
      ],
      TODAY
    )
    expect(tbd.map((i) => i.slug)).toEqual(["APPLE", "ZEBRA"])
  })
})

describe("formatBudgetLineCopy visual credits", () => {
  const story = (visuals: { type: string; status: string; name: string }[]) =>
    ({
      slug: "council-vote",
      budgetLine: "Council votes",
      wordCount: null,
      assignments: [],
      visuals: visuals.map((v, i) => ({ id: String(i), type: v.type, status: v.status, person: { name: v.name } })),
    }) as unknown as StoryListItem

  it("credits planned and delivered visuals only", () => {
    const copy = formatBudgetLineCopy(
      story([
        { type: "PHOTO", status: "PLANNED", name: "Ann Smith" },
        { type: "PHOTO", status: "DELIVERED", name: "Bo Jones" },
        { type: "PHOTO", status: "REQUESTED", name: "Cy Requested" },
        { type: "PHOTO", status: "ASSIGNED", name: "Di Assigned" },
        { type: "PHOTO", status: "IN_PROGRESS", name: "Ed Working" },
        { type: "PHOTO", status: "DECLINED", name: "Flo Declined" },
        { type: "GRAPHIC", status: "CANCELED", name: "Gus Canceled" },
      ])
    )
    expect(copy).toContain("Photos by SMITH & JONES")
    expect(copy).not.toMatch(/Requested|Assigned|Working|Declined|Canceled|Graphic by/i)
  })
})

describe("dedupeVisualCredits", () => {
  it("collapses duplicate story+type credits", () => {
    const out = dedupeVisualCredits([
      { storyId: "s1", type: "PHOTO", n: 1 },
      { storyId: "s1", type: "PHOTO", n: 2 },
      { storyId: "s1", type: "GRAPHIC", n: 3 },
    ])
    expect(out.map((v) => v.n)).toEqual([1, 3])
  })

  it("drops unplaced visuals instead of collapsing them into one null:PHOTO entry", () => {
    const out = dedupeVisualCredits([
      { storyId: null, type: "PHOTO", n: 1 },
      { storyId: null, type: "PHOTO", n: 2 },
      { storyId: "s1", type: "PHOTO", n: 3 },
    ])
    expect(out.map((v) => v.n)).toEqual([3])
  })
})

describe("placedVisuals", () => {
  it("keeps only credits whose story exists", () => {
    const out = placedVisuals([{ story: { id: "a" } }, { story: null }, { story: { id: "b" } }])
    expect(out.map((v) => v.story.id)).toEqual(["a", "b"])
  })
})

// Roster profile + map pin edit rights: self, admins, and — for contributors
// only — anyone who can create content.
describe("canEditRosterProfile", () => {
  it("lets anyone edit their own profile, staff or not", () => {
    expect(canEditRosterProfile("VIEWER", "p1", "p1", true)).toBe(true)
    expect(canEditRosterProfile("PRODUCER", "p1", "p1", false)).toBe(true)
  })

  it("lets admins edit anyone", () => {
    expect(canEditRosterProfile("ADMIN", null, "p2", true)).toBe(true)
    expect(canEditRosterProfile("LEADERSHIP", "p1", "p2", false)).toBe(true)
  })

  it("lets content creators edit a contributor", () => {
    expect(canEditRosterProfile("MANAGING_PRODUCER", "p1", "p2", false)).toBe(true)
    expect(canEditRosterProfile("PRODUCER", null, "p2", false)).toBe(true)
  })

  it("keeps a staffer's profile self-or-admin", () => {
    expect(canEditRosterProfile("MANAGING_PRODUCER", "p1", "p2", true)).toBe(false)
    expect(canEditRosterProfile("PRODUCER", null, "p2", true)).toBe(false)
  })

  it("never lets a viewer edit someone else", () => {
    expect(canEditRosterProfile("VIEWER", "p1", "p2", false)).toBe(false)
    expect(canEditRosterProfile("VIEWER", null, "p2", false)).toBe(false)
    expect(canEditRosterProfile("VIEWER", undefined, "p2", true)).toBe(false)
  })
})

describe("isNotifiablePerson / hasNotifiableTeam", () => {
  const staff = { email: "a@x.com", isActive: true, isStaff: true }
  const contributor = { email: "c@x.com", isActive: true, isStaff: false }
  const inactive = { email: "i@x.com", isActive: false, isStaff: true }
  const noEmail = { email: null, isActive: true, isStaff: true }

  it("only active staff with an email are notifiable", () => {
    expect(isNotifiablePerson(staff)).toBe(true)
    expect(isNotifiablePerson(contributor)).toBe(false)
    expect(isNotifiablePerson(inactive)).toBe(false)
    expect(isNotifiablePerson(noEmail)).toBe(false)
    expect(isNotifiablePerson(null)).toBe(false)
  })

  it("hides Notify All for a contributor-only team", () => {
    expect(hasNotifiableTeam([{ person: contributor }], [{ person: null, status: "PLANNED" }])).toBe(false)
    expect(hasNotifiableTeam([], [])).toBe(false)
  })

  it("counts a notifiable visual credit with no assignees", () => {
    expect(hasNotifiableTeam([{ person: contributor }], [{ person: staff, status: "PLANNED" }])).toBe(true)
  })

  it("ignores visual credits outside a notifiable status, like collectEmails()", () => {
    for (const status of ["REQUESTED", "DECLINED", "CANCELED"]) {
      expect(hasNotifiableTeam([], [{ person: staff, status }])).toBe(false)
    }
    for (const status of ["PLANNED", "ASSIGNED", "IN_PROGRESS", "DELIVERED"]) {
      expect(hasNotifiableTeam([], [{ person: staff, status }])).toBe(true)
    }
    // A notifiable status still doesn't rescue a contributor or inactive credit.
    expect(hasNotifiableTeam([], [{ person: contributor, status: "ASSIGNED" }])).toBe(false)
    expect(hasNotifiableTeam([], [{ person: inactive, status: "DELIVERED" }])).toBe(false)
  })

  it("leaves out the poster, case-insensitively, like the server", () => {
    expect(hasNotifiableTeam([{ person: staff }], [], "A@X.com")).toBe(false)
    expect(hasNotifiableTeam([{ person: staff }], [], "someone@else.com")).toBe(true)
  })
})
