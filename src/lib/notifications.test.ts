import { describe, it, expect } from "vitest"
import { truncateAtWord, pitchStatusLine, notifiableEmail, collectEmails } from "@/lib/notifications"

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

const staff = (name: string, email: string | null, isActive = true) => ({ name, email, isActive, isStaff: true })
const contributor = (name: string, email: string | null) => ({ name, email, isActive: true, isStaff: false })
// A visual with an active staffer credited, in the given status.
const visual = (status: string, email: string, isActive = true) => ({
  status,
  person: staff(email, email, isActive),
})

describe("notifiableEmail", () => {
  it("returns the email of an active staffer", () => {
    expect(notifiableEmail(staff("A", "a@x.com"))).toBe("a@x.com")
  })

  it("never emails a contributor, even with an email on file", () => {
    expect(notifiableEmail(contributor("C", "c@x.com"))).toBeNull()
  })

  it("never emails an inactive staffer", () => {
    expect(notifiableEmail(staff("I", "i@x.com", false))).toBeNull()
  })

  it("returns null with no email or no person", () => {
    expect(notifiableEmail(staff("N", null))).toBeNull()
    expect(notifiableEmail(null)).toBeNull()
  })
})

describe("collectEmails", () => {
  it("includes only active staff across assignments and visuals, deduped", () => {
    const emails = collectEmails(
      [
        { person: staff("A", "a@x.com"), role: "REPORTER" },
        { person: contributor("C", "c@x.com"), role: "PHOTOGRAPHER" },
        { person: staff("I", "i@x.com", false), role: "EDITOR" },
      ],
      [visual("PLANNED", "a@x.com"), visual("PLANNED", "b@x.com"), { status: "PLANNED", person: null }]
    )
    expect(emails).toEqual(["a@x.com", "b@x.com"])
  })

  it("emails assignees of planned, assigned, in-progress and delivered visuals", () => {
    const visuals = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "DELIVERED"].map((s) => visual(s, `${s.toLowerCase()}@x.com`))
    expect(collectEmails([], visuals).sort()).toEqual([
      "assigned@x.com",
      "delivered@x.com",
      "in_progress@x.com",
      "planned@x.com",
    ])
  })

  it("skips requested, declined and canceled visuals", () => {
    const visuals = ["REQUESTED", "DECLINED", "CANCELED"].map((s) => visual(s, `${s.toLowerCase()}@x.com`))
    expect(collectEmails([], visuals)).toEqual([])
  })

  it("still skips inactive people on notifiable visuals", () => {
    expect(collectEmails([], [visual("ASSIGNED", "gone@x.com", false)])).toEqual([])
  })

  it("still skips contributors on notifiable visuals", () => {
    expect(collectEmails([], [{ status: "ASSIGNED", person: contributor("C", "c@x.com") }])).toEqual([])
  })

  it("a notifiable status does not rescue a non-notifiable person, and vice versa", () => {
    // Status passes, person fails (contributor / inactive); person passes, status fails (REQUESTED).
    const emails = collectEmails(
      [{ person: staff("A", "a@x.com"), role: "REPORTER" }],
      [
        { status: "IN_PROGRESS", person: contributor("C", "c@x.com") },
        visual("DELIVERED", "gone@x.com", false),
        visual("REQUESTED", "req@x.com"),
        visual("ASSIGNED", "ok@x.com"),
      ]
    )
    expect(emails).toEqual(["a@x.com", "ok@x.com"])
  })
})
