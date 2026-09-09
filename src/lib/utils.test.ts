import { describe, it, expect } from "vitest"
import { classifyContentItems, itemDateStr, type DatedContentItem } from "./utils"

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
