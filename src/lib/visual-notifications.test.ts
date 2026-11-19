import { describe, it, expect } from "vitest"
import {
  PURGE_ACTOR,
  requesterNoticeEmail,
  requesterNoticeRecipient,
  type RequesterNoticeInput,
  deskRecipients,
  deskRecipientSource,
  validateEmailList,
  DESK_LIST_MAX_ADDRESSES,
  DESK_LIST_MAX_LENGTH,
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

describe("deskRecipients with the routing table (slice 3 §14)", () => {
  const env = {
    VISUAL_REQUEST_EMAILS_PHOTO: "photo-env@x.com",
    VISUAL_REQUEST_EMAILS_GRAPHIC: "graphic-env@x.com",
    VISUAL_REQUEST_EMAILS_VIDEO: "video-env@x.com",
  }
  const row = (type: string, emails: string) => ({ type, emails })

  it("uses a type's own row when it has addresses", () => {
    const rows = [row("PHOTO", "photo-db@x.com, b@x.com"), row("GRAPHIC", "graphic-db@x.com"), row("VIDEO", "video-db@x.com")]
    expect(deskRecipients("PHOTO", env, rows)).toEqual(["photo-db@x.com", "b@x.com"])
    expect(deskRecipients("GRAPHIC", env, rows)).toEqual(["graphic-db@x.com"])
    expect(deskRecipients("VIDEO", env, rows)).toEqual(["video-db@x.com"])
    expect(deskRecipientSource("PHOTO", env, rows)).toBe("table")
  })

  it("falls back to the env var with no row", () => {
    expect(deskRecipients("PHOTO", env, [row("GRAPHIC", "graphic-db@x.com")])).toEqual(["photo-env@x.com"])
    expect(deskRecipientSource("PHOTO", env, [])).toBe("env")
  })

  it("falls back to the env var when the row is empty or only separators", () => {
    for (const emails of ["", "   ", " , ,"]) {
      expect(deskRecipients("VIDEO", env, [row("VIDEO", emails)]), JSON.stringify(emails)).toEqual(["video-env@x.com"])
    }
  })

  it("Map: its own row, then the Graphic row, then the Graphic env var", () => {
    expect(deskRecipients("MAP", env, [row("MAP", "map-db@x.com"), row("GRAPHIC", "graphic-db@x.com")])).toEqual(["map-db@x.com"])
    expect(deskRecipientSource("MAP", env, [row("MAP", "map-db@x.com")])).toBe("table")

    expect(deskRecipients("MAP", env, [row("GRAPHIC", "graphic-db@x.com")])).toEqual(["graphic-db@x.com"])
    expect(deskRecipientSource("MAP", env, [row("GRAPHIC", "graphic-db@x.com")])).toBe("graphic table")

    expect(deskRecipients("MAP", env, [])).toEqual(["graphic-env@x.com"])
    expect(deskRecipientSource("MAP", env, [])).toBe("env")
  })

  it("Map with its own empty row still follows Graphic", () => {
    const rows = [row("MAP", " "), row("GRAPHIC", "graphic-db@x.com")]
    expect(deskRecipients("MAP", env, rows)).toEqual(["graphic-db@x.com"])
    expect(deskRecipients("MAP", env, [row("MAP", "")])).toEqual(["graphic-env@x.com"])
  })

  it("only Map follows Graphic: other types never borrow another row", () => {
    expect(deskRecipients("PHOTO", {}, [row("GRAPHIC", "graphic-db@x.com")])).toEqual([])
    expect(deskRecipients("VIDEO", {}, [row("PHOTO", "photo-db@x.com")])).toEqual([])
  })

  it("is empty, source none, when nothing is configured or the type is unknown", () => {
    expect(deskRecipients("PHOTO", {}, [])).toEqual([])
    expect(deskRecipientSource("PHOTO", {}, [])).toBe("none")
    expect(deskRecipients("HOLOGRAM", env, [row("HOLOGRAM", "h@x.com")])).toEqual([])
    expect(deskRecipientSource("HOLOGRAM", env, [])).toBe("none")
  })

  it("keeps slice 2 behavior when no rows are passed", () => {
    expect(deskRecipients("GRAPHIC", env)).toEqual(["graphic-env@x.com"])
    expect(deskRecipients("MAP", env)).toEqual(["graphic-env@x.com"])
  })
})

describe("validateEmailList", () => {
  it("normalizes a good list: trimmed, blanks and duplicates dropped", () => {
    expect(validateEmailList(" a@x.com ,, B@x.com, a@X.com ,")).toEqual({ ok: true, emails: ["a@x.com", "B@x.com"] })
  })

  it("accepts empty input as an empty list (use the fallback)", () => {
    expect(validateEmailList("")).toEqual({ ok: true, emails: [] })
    expect(validateEmailList(" , ")).toEqual({ ok: true, emails: [] })
  })

  it("names exactly the bad address among good ones", () => {
    expect(validateEmailList("visualrequests@oregonian.com, dave@oregonian, mfriesen@oregonian.com")).toEqual({
      ok: false,
      errors: [{ address: "dave@oregonian", message: "dave@oregonian isn't a valid email address" }],
    })
  })

  it("gives one error per bad address", () => {
    const result = validateEmailList("nope, also nope@, ok@x.com")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.address)).toEqual(["nope", "also nope@"])
  })

  it("rejects too many addresses or too long a list", () => {
    const many = Array.from({ length: DESK_LIST_MAX_ADDRESSES + 1 }, (_, i) => `p${i}@x.com`).join(",")
    const tooMany = validateEmailList(many)
    expect(tooMany.ok).toBe(false)
    if (!tooMany.ok) expect(tooMany.errors[0].address).toBeNull()

    const exactly = Array.from({ length: DESK_LIST_MAX_ADDRESSES }, (_, i) => `p${i}@x.com`).join(",")
    expect(validateEmailList(exactly).ok).toBe(true)

    expect(validateEmailList("a".repeat(DESK_LIST_MAX_LENGTH + 1)).ok).toBe(false)
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
    links: [],
    dataUrl: null,
    story: { id: "s1", slug: "SUPERINTENDENT", budgetLine: "New superintendent starts Monday" },
    requestedBy: { name: "Ann Smith" },
  }

  it("builds a normal subject with the type label and slug", () => {
    expect(visualRequestEmail(base).subject).toBe("Visuals Request (Photo): SUPERINTENDENT")
    expect(visualRequestEmail({ ...base, type: "GRAPHIC" }).subject).toBe("Visuals Request (Graphic): SUPERINTENDENT")
  })

  it("flags an urgent request in the subject and adds a Priority line", () => {
    const { subject, text, html } = visualRequestEmail({ ...base, priority: "URGENT" })
    expect(subject).toBe("Visuals Request URGENT (Photo): SUPERINTENDENT")
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
    for (const label of ["Event:", "Location:", "Needed by:", "Link:", "Links:", "Notes:"]) {
      expect(sparse, label).not.toContain(label)
    }

    const full = visualRequestEmail({
      ...base,
      eventDateTime: new Date("2026-11-18T14:30:00.000Z"),
      location: "City Hall",
      deadline: "2026-11-23T06:00:00.000Z",
      notes: "Ask for Maria\nat the front desk",
      links: ["https://example.com/sheet"],
    })
    expect(full.text).toMatch(/Event: .*Nov 18, 2026/)
    expect(full.text).toContain("Location: City Hall")
    expect(full.text).toMatch(/Needed by: .*Nov 23, 2026/)
    expect(full.text).toContain("Link: https://example.com/sheet")
    expect(full.text).toContain("Notes: Ask for Maria\nat the front desk")
    expect(full.html).toContain("Ask for Maria<br>at the front desk")
  })

  it("shows no link row with no links", () => {
    const { text, html } = visualRequestEmail({ ...base, links: [] })
    expect(text).not.toMatch(/Links?:/)
    expect(html).not.toMatch(/Links?:/)
  })

  it("shows one link inline, as an href in HTML", () => {
    const { text, html } = visualRequestEmail({ ...base, links: ["https://example.com/sheet"] })
    expect(text).toContain("Link: https://example.com/sheet")
    expect(html).toContain('<strong>Link:</strong> <a href="https://example.com/sheet">https://example.com/sheet</a>')
  })

  it("lists several links one per line, each an href in HTML", () => {
    const { text, html } = visualRequestEmail({
      ...base,
      links: ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
      notes: "Thanks",
    })
    expect(text).toContain("Links:\n- https://example.com/a\n- https://example.com/b\n- https://example.com/c\nNotes: Thanks")
    expect(html).toContain(
      '<strong>Links:</strong> <a href="https://example.com/a">https://example.com/a</a><br>' +
        '<a href="https://example.com/b">https://example.com/b</a><br>' +
        '<a href="https://example.com/c">https://example.com/c</a>'
    )
  })

  it("falls back to the legacy dataUrl when links is empty", () => {
    const { text, html } = visualRequestEmail({ ...base, links: [], dataUrl: "https://example.com/old" })
    expect(text).toContain("Link: https://example.com/old")
    expect(html).toContain('<a href="https://example.com/old">')
    // links wins when it has any.
    expect(visualRequestEmail({ ...base, links: ["https://example.com/new"], dataUrl: "https://example.com/old" }).text)
      .not.toContain("example.com/old")
  })

  it("links each URL in HTML only when it passes parseDataUrl again", () => {
    // A value that could only get here by bypassing the schema is shown as text, never an href.
    const bad = visualRequestEmail({ ...base, links: ["https://example.com/ok", "javascript:alert(1)"] })
    expect(bad.html).toContain('<a href="https://example.com/ok">')
    expect(bad.html).not.toContain("<a href=\"javascript")
    expect(bad.html).toContain("javascript:alert(1)")
    expect(bad.text).toContain("- javascript:alert(1)")

    const legacyBad = visualRequestEmail({ ...base, dataUrl: "javascript:alert(1)" })
    expect(legacyBad.html).not.toContain("<a href=\"javascript")
    expect(legacyBad.text).toContain("Link: javascript:alert(1)")
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
        "Visuals Request (Photo): Gov. Tina Kotek is speaking in Portland, update our…"
      )
      expect(visualRequestEmail({ ...standalone, priority: "URGENT" }).subject).toMatch(
        /^Visuals Request URGENT \(Photo\): Gov\. Tina Kotek/
      )
      expect(visualRequestEmail({ ...standalone, description: "Kotek portraits" }).subject).toBe(
        "Visuals Request (Photo): Kotek portraits"
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
    id: "v1",
    type: "PHOTO",
    status: "ASSIGNED",
    person: staff("Ann", "ann@x.com"),
    story,
    ...over,
  })

  it("groups several visuals for one person into one notice with a line each", () => {
    const groups = storyDeletedNotices([
      notice({ type: "PHOTO", status: "ASSIGNED" }),
      notice({ id: "v2", type: "GRAPHIC", status: "IN_PROGRESS" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].email).toBe("ann@x.com")
    expect(groups[0].name).toBe("Ann")
    expect(groups[0].lines).toEqual([
      { text: "Photo (assigned): this assignment was removed with the story." },
      {
        text: "Graphic (in progress): your visual was kept and is now unplaced. Attach it to another story from its request page:",
        href: expect.stringMatching(/\/requests\/v2$/),
      },
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
      { text: "Photo (assigned): this assignment was removed with the story." },
      {
        text: "Graphic (in progress): your visual was kept and is now unplaced. Attach it to another story from its request page:",
        href: "https://news.example/requests/v2",
      },
    ],
  }

  it("builds the subject and both wording variants in text and HTML", () => {
    const { subject, text, html } = storyDeletedEmail(group, "Sam Okafor")
    expect(subject).toBe("Visuals Request: story deleted: COUNCIL")
    expect(text).toContain("A story you have a visual assignment on was deleted from the News Budget.")
    expect(text).toContain("COUNCIL: Council votes on budget")
    expect(text).toContain("- Photo (assigned): this assignment was removed with the story.\n")
    expect(text).toContain("- Graphic (in progress): your visual was kept and is now unplaced.")
    expect(html).toContain("<li>Photo (assigned): this assignment was removed with the story.</li>")
    expect(html).toContain("<li>Graphic (in progress): your visual was kept and is now unplaced.")
  })

  it("links an in-progress visual to its request page, and nothing else", () => {
    const { text, html } = storyDeletedEmail(group, "Sam Okafor")
    expect(text).toContain("from its request page: https://news.example/requests/v2\n")
    expect(html).toContain(
      'from its request page: <a href="https://news.example/requests/v2">https://news.example/requests/v2</a></li>'
    )
    // One link only: the assigned line has none, and there's no link to the deleted story.
    expect(text.match(/https?:\/\//g)).toHaveLength(1)
    expect(html).not.toContain("/stories/")
  })

  it("names who deleted it, a person or the purge", () => {
    expect(storyDeletedEmail(group, "Sam Okafor").text).toContain("Deleted by: Sam Okafor")
    expect(storyDeletedEmail(group, PURGE_ACTOR).text).toContain(
      "Deleted by: the nightly purge of stories shelved more than 90 days"
    )
    expect(storyDeletedEmail(group, "<Sam>").html).toContain("<strong>Deleted by:</strong> &lt;Sam&gt;")
  })
})

describe("requesterNoticeRecipient", () => {
  const staff = { email: "ann@x.com", isActive: true, isStaff: true }

  it("emails an active staff requester", () => {
    expect(requesterNoticeRecipient({ requestedById: "p-ann", requestedBy: staff }, "p-desk")).toBe("ann@x.com")
  })

  it("still emails when the actor's account isn't linked to a Person", () => {
    expect(requesterNoticeRecipient({ requestedById: "p-ann", requestedBy: staff }, null)).toBe("ann@x.com")
  })

  it("skips the requester when they made the change themselves", () => {
    expect(requesterNoticeRecipient({ requestedById: "p-ann", requestedBy: staff }, "p-ann")).toBeNull()
  })

  it("follows notifiableEmail: no contributor, inactive staffer, or missing email", () => {
    for (const person of [
      { ...staff, isStaff: false },
      { ...staff, isActive: false },
      { ...staff, email: null },
    ]) {
      expect(requesterNoticeRecipient({ requestedById: "p-ann", requestedBy: person }, "p-desk")).toBeNull()
    }
  })

  it("skips a request whose requester is gone", () => {
    expect(requesterNoticeRecipient({ requestedById: null, requestedBy: null }, "p-desk")).toBeNull()
  })
})

describe("requesterNoticeEmail", () => {
  const base: RequesterNoticeInput = {
    id: "v1",
    type: "PHOTO",
    status: "DELIVERED",
    description: "Portrait of the new superintendent",
    declineReason: null,
    story: { id: "s1", slug: "SUPERINTENDENT", budgetLine: "New superintendent starts Monday" },
    person: { name: "Beth Nakamura" },
    actorName: "Sam Okafor",
  }
  const email = (over: Partial<RequesterNoticeInput>) => requesterNoticeEmail({ ...base, ...over })!

  it("only covers declined and delivered", () => {
    for (const status of ["PLANNED", "REQUESTED", "ASSIGNED", "IN_PROGRESS", "CANCELED"]) {
      expect(requesterNoticeEmail({ ...base, status }), status).toBeNull()
    }
  })

  it("delivered on a story: who delivered it, the story, both links", () => {
    const { subject, text, html } = email({})
    expect(subject).toBe("Visuals Request delivered (Photo): SUPERINTENDENT")
    expect(text).toContain("Your photo request was delivered by Beth Nakamura.")
    expect(text).toContain("SUPERINTENDENT: New superintendent starts Monday")
    expect(text).toContain("You asked for: Portrait of the new superintendent")
    expect(text).not.toContain("Reason:")
    expect(text).not.toContain("isn't attached")
    expect(text).toMatch(/View the request: \S+\/requests\/v1\nView the story: \S+\/stories\/s1$/)
    expect(html).toMatch(/<a href="[^"]+\/requests\/v1">View the request in the News Budget<\/a>/)
  })

  it("delivered standalone: subject from the description, a nudge to attach it, request link only", () => {
    const { subject, text, html } = email({
      story: null,
      description: "Gov. Tina Kotek is speaking in Portland, update our file photos",
    })
    expect(subject).toBe("Visuals Request delivered (Photo): Gov. Tina Kotek is speaking in Portland, update our…")
    expect(text).toContain("It isn't attached to a story yet. Attach it to one from its request page.")
    expect(text).toMatch(/View the request: \S+\/requests\/v1$/)
    expect(html).not.toContain("/stories/")
  })

  it("delivered with no assignee on the row still reads sensibly", () => {
    expect(email({ person: null }).text).toContain("Your photo request was marked delivered.")
  })

  it("declined: who declined it, the reason, what to do next", () => {
    const { subject, text, html } = email({ status: "DECLINED", declineReason: "No photographer free that night", type: "GRAPHIC" })
    expect(subject).toBe("Visuals Request declined (Graphic): SUPERINTENDENT")
    expect(text).toContain("Your graphic request was declined by Sam Okafor.")
    expect(text).toContain("Reason: No photographer free that night")
    expect(text).toContain("If you still need it, talk to the visuals desk or file a new request.")
    expect(html).toContain("<strong>Reason:</strong> No photographer free that night")
  })

  it("declined standalone has no story line or story link", () => {
    const { subject, text } = email({ status: "DECLINED", declineReason: "Use file art", story: null, description: "Kotek portraits" })
    expect(subject).toBe("Visuals Request declined (Photo): Kotek portraits")
    expect(text).not.toContain("/stories/")
  })

  it("shows no link row without links, one inline, several one per line", () => {
    expect(email({}).text).not.toMatch(/Links?:/)
    expect(email({ links: [] }).text).not.toMatch(/Links?:/)

    const one = email({ links: ["https://example.com/sheet"] })
    expect(one.text).toContain("You asked for: Portrait of the new superintendent\nLink: https://example.com/sheet")
    expect(one.html).toContain('<strong>Link:</strong> <a href="https://example.com/sheet">')

    const several = email({ status: "DECLINED", declineReason: "No one free", links: ["https://example.com/a", "https://example.com/b"] })
    expect(several.text).toContain("Links:\n- https://example.com/a\n- https://example.com/b\nReason: No one free")
    expect(several.html).toContain('<a href="https://example.com/a">https://example.com/a</a><br><a href="https://example.com/b">')
  })

  it("falls back to the legacy dataUrl, and never makes an unsafe link an href", () => {
    expect(email({ dataUrl: "https://example.com/old" }).text).toContain("Link: https://example.com/old")
    const bad = email({ links: ["javascript:alert(1)"] })
    expect(bad.html).not.toContain('<a href="javascript')
    expect(bad.text).toContain("Link: javascript:alert(1)")
  })

  it("escapes HTML in the reason and description", () => {
    const { html } = email({ status: "DECLINED", declineReason: "<b>no</b> & \"never\"", description: "<i>x</i>" })
    expect(html).toContain("&lt;b&gt;no&lt;/b&gt; &amp; &quot;never&quot;")
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;")
    expect(html).not.toContain("<b>no</b>")
  })
})

// The visuals desk files these with inbox rules that match the start of the
// subject (Ryan and Elliot, Nov 18). Every visual-request email must keep it.
describe("visual-request subject prefix", () => {
  const story = { id: "s1", slug: "SLUG", budgetLine: "Budget line" }
  const request = {
    id: "v1", type: "PHOTO", priority: "NORMAL", description: "Kotek portraits",
    eventDateTime: null, location: null, deadline: null, notes: null, story, requestedBy: { name: "Ann" },
  }
  const notice = {
    id: "v1", type: "PHOTO", status: "DELIVERED", description: "Kotek portraits", declineReason: "No",
    story, person: { name: "Beth" }, actorName: "Sam",
  }

  it("starts every subject with \"Visuals Request\", urgent and standalone included", () => {
    const subjects = [
      visualRequestEmail(request).subject,
      visualRequestEmail({ ...request, priority: "URGENT" }).subject,
      visualRequestEmail({ ...request, story: null }).subject,
      visualRequestEmail({ ...request, priority: "URGENT", story: null }).subject,
      requesterNoticeEmail(notice)!.subject,
      requesterNoticeEmail({ ...notice, status: "DECLINED" })!.subject,
      requesterNoticeEmail({ ...notice, story: null })!.subject,
      storyDeletedEmail({ email: "a@x.com", name: "A", story, lines: [{ text: "x" }] }, "Sam").subject,
    ]
    for (const subject of subjects) expect(subject, subject).toMatch(/^Visuals Request\b/)
  })
})
