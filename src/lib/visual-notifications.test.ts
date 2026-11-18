import { describe, it, expect } from "vitest"
import {
  PURGE_ACTOR,
  deskRecipients,
  parseEmailList,
  storyDeletedEmail,
  storyDeletedNotices,
  visualRequestEmail,
  type DeletedStoryNotice,
  type VisualRequestEmailInput,
} from "@/lib/visual-notifications"

describe("parseEmailList", () => {
  it("returns nothing for an unset, empty, or whitespace list", () => {
    expect(parseEmailList(undefined)).toEqual([])
    expect(parseEmailList(null)).toEqual([])
    expect(parseEmailList("")).toEqual([])
    expect(parseEmailList("  , ,")).toEqual([])
  })

  it("trims entries and drops blanks", () => {
    expect(parseEmailList(" a@x.com ,, b@x.com ,")).toEqual(["a@x.com", "b@x.com"])
  })

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(parseEmailList("Desk@x.com, desk@x.com, DESK@X.COM, c@x.com")).toEqual(["Desk@x.com", "c@x.com"])
  })
})

describe("deskRecipients", () => {
  const env = {
    VISUAL_REQUEST_EMAILS_PHOTO: "photo@x.com",
    VISUAL_REQUEST_EMAILS_GRAPHIC: "graphics@x.com, dave@x.com",
    VISUAL_REQUEST_EMAILS_VIDEO: "video@x.com",
  }

  it("routes each type to its own list, and Map to the graphic list", () => {
    expect(deskRecipients("PHOTO", env)).toEqual(["photo@x.com"])
    expect(deskRecipients("GRAPHIC", env)).toEqual(["graphics@x.com", "dave@x.com"])
    expect(deskRecipients("MAP", env)).toEqual(["graphics@x.com", "dave@x.com"])
    expect(deskRecipients("VIDEO", env)).toEqual(["video@x.com"])
  })

  it("is empty for an unknown type or an unset list", () => {
    expect(deskRecipients("HOLOGRAM", env)).toEqual([])
    expect(deskRecipients("VIDEO", { ...env, VISUAL_REQUEST_EMAILS_VIDEO: undefined })).toEqual([])
    expect(deskRecipients("PHOTO", {})).toEqual([])
  })

  it("never reads process.env on its own", () => {
    expect(deskRecipients("PHOTO", { VISUAL_REQUEST_EMAILS_GRAPHIC: "g@x.com" })).toEqual([])
  })
})

describe("visualRequestEmail", () => {
  const base: VisualRequestEmailInput = {
    id: "v1",
    type: "PHOTO",
    priority: "NORMAL",
    description: "Portrait of the new superintendent",
    eventDateTime: null,
    location: null,
    deadline: null,
    notes: null,
    dataUrl: null,
    story: { id: "s1", slug: "SUPERINTENDENT", budgetLine: "New superintendent starts Monday" },
    requestedBy: { name: "Ann Smith" },
  }

  it("builds a normal subject with the type label and slug", () => {
    expect(visualRequestEmail(base).subject).toBe("News Budget visual request (Photo): SUPERINTENDENT")
    expect(visualRequestEmail({ ...base, type: "GRAPHIC" }).subject).toBe("News Budget visual request (Graphic): SUPERINTENDENT")
  })

  it("flags an urgent request in the subject and adds a Priority line", () => {
    const { subject, text, html } = visualRequestEmail({ ...base, priority: "URGENT" })
    expect(subject).toBe("URGENT visual request (Photo): SUPERINTENDENT")
    expect(text).toContain("Priority: Urgent")
    expect(html).toContain("<strong>Priority:</strong> Urgent")
    expect(visualRequestEmail(base).text).not.toContain("Priority:")
  })

  it("leads with the requester, the slug, the budget line and the description", () => {
    const { text, html } = visualRequestEmail(base)
    expect(text).toContain("Ann Smith requested a photo for a story in the News Budget.")
    expect(text).toContain("SUPERINTENDENT: New superintendent starts Monday")
    expect(text).toContain("What's needed: Portrait of the new superintendent")
    expect(html).toContain("<strong>SUPERINTENDENT:</strong> New superintendent starts Monday")
    expect(html).toContain("<strong>What's needed:</strong> Portrait of the new superintendent")
  })

  it("falls back to an anonymous lead when the requester is gone", () => {
    expect(visualRequestEmail({ ...base, requestedBy: null }).text).toContain(
      "A photo was requested for a story in the News Budget."
    )
  })

  it("omits optional rows when they are null and includes them when set", () => {
    const sparse = visualRequestEmail(base).text
    for (const label of ["Event:", "Location:", "Needed by:", "Data:", "Notes:"]) {
      expect(sparse, label).not.toContain(label)
    }

    const full = visualRequestEmail({
      ...base,
      eventDateTime: new Date("2026-11-18T14:30:00.000Z"),
      location: "City Hall",
      deadline: "2026-11-23T06:00:00.000Z",
      notes: "Ask for Maria\nat the front desk",
      dataUrl: "https://example.com/sheet",
    })
    expect(full.text).toMatch(/Event: .*Nov 18, 2026/)
    expect(full.text).toContain("Location: City Hall")
    expect(full.text).toMatch(/Needed by: .*Nov 23, 2026/)
    expect(full.text).toContain("Data: https://example.com/sheet")
    expect(full.text).toContain("Notes: Ask for Maria\nat the front desk")
    expect(full.html).toContain("Ask for Maria<br>at the front desk")
  })

  it("links the data URL in HTML only when it passes parseDataUrl again", () => {
    const good = visualRequestEmail({ ...base, dataUrl: "https://example.com/sheet" }).html
    expect(good).toContain('<a href="https://example.com/sheet">https://example.com/sheet</a>')

    // A value that could only get here by bypassing the schema is shown as text, never an href.
    const bad = visualRequestEmail({ ...base, dataUrl: "javascript:alert(1)" })
    expect(bad.html).not.toContain("<a href=\"javascript")
    expect(bad.html).toContain("javascript:alert(1)")
    expect(bad.text).toContain("Data: javascript:alert(1)")
  })

  it("escapes HTML in user-supplied text", () => {
    const { html } = visualRequestEmail({ ...base, description: "<b>bold</b> & \"quoted\"" })
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;")
    expect(html).not.toContain("<b>bold</b>")
  })

  it("links to the request page and, for a story request, the story", () => {
    const { text, html } = visualRequestEmail(base)
    expect(text).toMatch(/View the request: \S+\/requests\/v1\nView the story: \S+\/stories\/s1$/)
    expect(html).toMatch(/<a href="[^"]+\/requests\/v1">View the request in the News Budget<\/a>/)
    expect(html).toMatch(/<a href="[^"]+\/stories\/s1">View the story<\/a>/)
  })

  describe("standalone request (no story)", () => {
    const standalone: VisualRequestEmailInput = {
      ...base,
      description: "Gov. Tina Kotek is speaking in Portland, update our file photos",
      story: null,
    }

    it("takes its subject from the description, cut at a word", () => {
      expect(visualRequestEmail(standalone).subject).toBe(
        "News Budget visual request (Photo): Gov. Tina Kotek is speaking in Portland, update our…"
      )
      expect(visualRequestEmail({ ...standalone, priority: "URGENT" }).subject).toMatch(
        /^URGENT visual request \(Photo\): Gov\. Tina Kotek/
      )
      expect(visualRequestEmail({ ...standalone, description: "Kotek portraits" }).subject).toBe(
        "News Budget visual request (Photo): Kotek portraits"
      )
    })

    it("says it isn't on a story, and has no story line or story link", () => {
      const { text, html } = visualRequestEmail(standalone)
      expect(text).toContain("Ann Smith requested a photo in the News Budget. It isn't attached to a story yet.")
      expect(text).not.toContain("SUPERINTENDENT")
      expect(text).not.toContain("/stories/")
      expect(html).not.toContain("/stories/")
      expect(visualRequestEmail({ ...standalone, requestedBy: null }).text).toContain(
        "A photo was requested in the News Budget. It isn't attached to a story yet."
      )
    })

    it("still lists the details and links to the request page", () => {
      const { text, html } = visualRequestEmail({ ...standalone, location: "Portland" })
      expect(text).toContain("What's needed: Gov. Tina Kotek is speaking in Portland, update our file photos")
      expect(text).toContain("Location: Portland")
      expect(text).toMatch(/View the request: \S+\/requests\/v1$/)
      expect(html).toMatch(/<a href="[^"]+\/requests\/v1">View the request in the News Budget<\/a><\/p>$/)
    })
  })
})

describe("storyDeletedNotices", () => {
  const story = { id: "s1", slug: "COUNCIL", budgetLine: "Council votes on budget" }
  const staff = (name: string, email: string, isActive = true) => ({ name, email, isActive, isStaff: true })
  const contributor = { name: "Cy", email: "cy@x.com", isActive: true, isStaff: false }
  const notice = (over: Partial<DeletedStoryNotice>): DeletedStoryNotice => ({
    type: "PHOTO",
    status: "ASSIGNED",
    person: staff("Ann", "ann@x.com"),
    story,
    ...over,
  })

  it("groups several visuals for one person into one notice with a line each", () => {
    const groups = storyDeletedNotices([
      notice({ type: "PHOTO", status: "ASSIGNED" }),
      notice({ type: "GRAPHIC", status: "IN_PROGRESS" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].email).toBe("ann@x.com")
    expect(groups[0].name).toBe("Ann")
    expect(groups[0].lines).toEqual([
      "Photo (assigned): this assignment was removed with the story.",
      "Graphic (in progress): your visual was kept but is no longer attached to a story. Contact the visuals desk if it needs a new home.",
    ])
  })

  it("makes one group per person, and per story for the purge cron", () => {
    const other = { id: "s2", slug: "PARKS", budgetLine: "Parks levy" }
    const groups = storyDeletedNotices([
      notice({}),
      notice({ person: staff("Bo", "bo@x.com") }),
      notice({ story: other }),
      notice({ person: staff("Ann again", "ANN@x.com") }), // same person, different spelling
    ])
    expect(groups.map((g) => `${g.email}|${g.story.slug}|${g.lines.length}`)).toEqual([
      "ann@x.com|COUNCIL|2",
      "bo@x.com|COUNCIL|1",
      "ann@x.com|PARKS|1",
    ])
  })

  it("drops rows with no assignee, a contributor, an inactive staffer, or no email", () => {
    expect(
      storyDeletedNotices([
        notice({ person: null }),
        notice({ person: contributor }),
        notice({ person: staff("Gone", "gone@x.com", false) }),
        notice({ person: { name: "No mail", email: null, isActive: true, isStaff: true } }),
      ])
    ).toEqual([])
  })

  it("only notices ASSIGNED and IN_PROGRESS visuals", () => {
    for (const status of ["PLANNED", "REQUESTED", "DELIVERED", "DECLINED", "CANCELED"]) {
      expect(storyDeletedNotices([notice({ status })]), status).toEqual([])
    }
  })
})

describe("storyDeletedEmail", () => {
  const group = {
    email: "ann@x.com",
    name: "Ann",
    story: { id: "s1", slug: "COUNCIL", budgetLine: "Council votes on budget" },
    lines: [
      "Photo (assigned): this assignment was removed with the story.",
      "Graphic (in progress): your visual was kept but is no longer attached to a story. Contact the visuals desk if it needs a new home.",
    ],
  }

  it("builds the subject and both wording variants in text and HTML", () => {
    const { subject, text, html } = storyDeletedEmail(group, "Sam Okafor")
    expect(subject).toBe("News Budget story deleted: COUNCIL")
    expect(text).toContain("A story you have a visual assignment on was deleted from the News Budget.")
    expect(text).toContain("COUNCIL: Council votes on budget")
    expect(text).toContain("- Photo (assigned): this assignment was removed with the story.")
    expect(text).toContain("- Graphic (in progress): your visual was kept but is no longer attached to a story.")
    expect(html).toContain("<li>Photo (assigned): this assignment was removed with the story.</li>")
    expect(html).toContain("<li>Graphic (in progress): your visual was kept")
    expect(text).not.toContain("http")
  })

  it("names who deleted it, a person or the purge", () => {
    expect(storyDeletedEmail(group, "Sam Okafor").text).toContain("Deleted by: Sam Okafor")
    expect(storyDeletedEmail(group, PURGE_ACTOR).text).toContain(
      "Deleted by: the nightly purge of stories shelved more than 90 days"
    )
    expect(storyDeletedEmail(group, "<Sam>").html).toContain("<strong>Deleted by:</strong> &lt;Sam&gt;")
  })
})
