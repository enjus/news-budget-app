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
})

describe("pitchStatusLine", () => {
  const now = new Date("2026-10-21T19:00:00Z")

  it("names the claimant and the expiry date in Pacific time", () => {
    // 2026-10-29 03:00 UTC is still Wed Oct 28 in Portland.
    expect(
      pitchStatusLine(
        { text: TIP, claimantName: "Marcus Lee", expiresAt: new Date("2026-10-29T03:00:00Z") },
        now
      )
    ).toBe("Claimed by Marcus Lee · Expires Wed, Oct 28")
  })

  it("says Unclaimed and Evergreen", () => {
    expect(pitchStatusLine({ text: TIP, claimantName: null, expiresAt: null }, now)).toBe(
      "Unclaimed · Evergreen"
    )
  })

  it("adds the year when the expiry is in a different year", () => {
    expect(
      pitchStatusLine(
        { text: TIP, claimantName: null, expiresAt: new Date("2027-01-04T20:00:00Z") },
        now
      )
    ).toBe("Unclaimed · Expires Mon, Jan 4, 2027")
  })
})
