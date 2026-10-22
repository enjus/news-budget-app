import { describe, it, expect } from "vitest"
import { truncateAtWord, pitchStatusLine } from "@/lib/notifications"

const TIP =
  "Tipster says Multnomah County's new shelter on SE 82nd won't open until spring — contractor walked off the job"

describe("truncateAtWord", () => {
  it("leaves short text alone", () => {
    expect(truncateAtWord("Short tip", 55)).toBe("Short tip")
  })

  it("cuts at the last word boundary and adds an ellipsis", () => {
    expect(truncateAtWord(TIP, 55)).toBe("Tipster says Multnomah County's new shelter on SE 82nd…")
  })

  it("drops a dangling dash or comma before the ellipsis", () => {
    expect(truncateAtWord("Shelter won't open until spring — contractor left", 34)).toBe(
      "Shelter won't open until spring…"
    )
  })

  it("collapses newlines so a multi-line tip stays one subject line", () => {
    expect(truncateAtWord("Line one\nline two", 55)).toBe("Line one line two")
  })

  it("hard-cuts a single word longer than the limit", () => {
    expect(truncateAtWord("a".repeat(60), 55)).toBe("a".repeat(55) + "…")
  })

  it("doesn't split an emoji at the cut", () => {
    expect(truncateAtWord("a".repeat(54) + "😀" + "b".repeat(10), 55)).toBe("a".repeat(54) + "😀…")
  })

  it("keeps the punctuation when it's all the head has", () => {
    expect(truncateAtWord("———— " + "x".repeat(60), 10)).toBe("————…")
  })
})

describe("pitchStatusLine", () => {
  const today = "2026-10-21"
  const base = { text: TIP, claimantName: null, expiresAt: null, shelved: false }

  it("names the claimant and the expiry date in Pacific time", () => {
    // 2026-10-29 03:00 UTC is still Wed Oct 28 in Portland.
    expect(
      pitchStatusLine(
        { ...base, claimantName: "Marcus Lee", expiresAt: new Date("2026-10-29T03:00:00Z") },
        today
      )
    ).toBe("Claimed by Marcus Lee · Expires Wed, Oct 28")
  })

  it("says Unclaimed and Evergreen", () => {
    expect(pitchStatusLine(base, today)).toBe("Unclaimed · Evergreen")
  })

  it("adds the year when the expiry is in a different year", () => {
    expect(pitchStatusLine({ ...base, expiresAt: new Date("2027-01-04T20:00:00Z") }, today)).toBe(
      "Unclaimed · Expires Mon, Jan 4, 2027"
    )
  })

  it("says Expires today on the Pacific expiry date", () => {
    expect(pitchStatusLine({ ...base, expiresAt: new Date("2026-10-22T05:00:00Z") }, today)).toBe(
      "Unclaimed · Expires today"
    )
  })

  it("says Expired once the date has passed", () => {
    expect(
      pitchStatusLine(
        { ...base, claimantName: "Marcus Lee", expiresAt: new Date("2026-10-14T19:00:00Z") },
        today
      )
    ).toBe("Claimed by Marcus Lee · Expired Wed, Oct 14")
  })

  it("leads with Shelved for a shelved pitch", () => {
    expect(
      pitchStatusLine({ ...base, shelved: true, expiresAt: new Date("2026-10-14T19:00:00Z") }, today)
    ).toBe("Shelved · Unclaimed · Expired Wed, Oct 14")
  })
})
