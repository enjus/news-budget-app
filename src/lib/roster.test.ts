import { describe, it, expect } from "vitest"
import {
  normalizeHandle, socialUrl, socialDisplay, normalizePhone, formatPhone, formatAddressLines,
  buildRosterCsv, ROSTER_CSV_HEADER, compareBySurname,
} from "@/lib/roster"

describe("normalizeHandle", () => {
  it("treats blank input as a cleared field", () => {
    expect(normalizeHandle("x", "")).toBeNull()
    expect(normalizeHandle("x", "   ")).toBeNull()
    expect(normalizeHandle("x", null)).toBeNull()
  })

  it("strips a leading @ and accepts bare handles", () => {
    expect(normalizeHandle("x", "@oregonian")).toBe("oregonian")
    expect(normalizeHandle("instagram", "the.oregonian")).toBe("the.oregonian")
  })

  it("pulls the handle out of pasted profile URLs", () => {
    expect(normalizeHandle("x", "https://x.com/oregonian?s=20")).toBe("oregonian")
    expect(normalizeHandle("x", "twitter.com/oregonian")).toBe("oregonian")
    expect(normalizeHandle("x", "https://mobile.twitter.com/oregonian/status/1")).toBe("oregonian")
    expect(normalizeHandle("instagram", "https://www.instagram.com/the.oregonian/")).toBe("the.oregonian")
    expect(normalizeHandle("linkedin", "linkedin.com/in/jane-doe/")).toBe("jane-doe")
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/in/jane-doe-1a2b3c?trk=x")).toBe("jane-doe-1a2b3c")
    expect(normalizeHandle("bluesky", "https://bsky.app/profile/Jane.bsky.social")).toBe("jane.bsky.social")
  })

  it("lowercases Bluesky handles and accepts custom domains and DIDs", () => {
    expect(normalizeHandle("bluesky", "@Jane.Bsky.Social")).toBe("jane.bsky.social")
    expect(normalizeHandle("bluesky", "jane.example.com")).toBe("jane.example.com")
    expect(normalizeHandle("bluesky", "did:plc:abcdefghijklmnopqrstuvwx")).toBe("did:plc:abcdefghijklmnopqrstuvwx")
  })

  it("rejects invalid handles", () => {
    expect(normalizeHandle("x", "has spaces")).toBeUndefined()
    expect(normalizeHandle("x", "waytoolonghandle123")).toBeUndefined()
    expect(normalizeHandle("bluesky", "jane")).toBeUndefined()
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/company/oregonian")).toBeUndefined()
  })

  it("does not treat another site's URL as a handle", () => {
    expect(normalizeHandle("x", "https://instagram.com/foo")).toBeUndefined()
  })
})

describe("socialUrl / socialDisplay", () => {
  it("builds profile links", () => {
    expect(socialUrl("x", "foo")).toBe("https://x.com/foo")
    expect(socialUrl("bluesky", "foo.bsky.social")).toBe("https://bsky.app/profile/foo.bsky.social")
    expect(socialUrl("linkedin", "jane-doe")).toBe("https://www.linkedin.com/in/jane-doe/")
    expect(socialUrl("instagram", "foo")).toBe("https://www.instagram.com/foo/")
  })

  it("prefixes @ except for LinkedIn slugs", () => {
    expect(socialDisplay("x", "foo")).toBe("@foo")
    expect(socialDisplay("linkedin", "jane-doe")).toBe("jane-doe")
  })
})

describe("normalizePhone / formatPhone", () => {
  it("normalizes US numbers in any common format to E.164", () => {
    expect(normalizePhone("(503) 555-0123")).toBe("+15035550123")
    expect(normalizePhone("503.555.0123")).toBe("+15035550123")
    expect(normalizePhone("+1 503 555 0123")).toBe("+15035550123")
  })

  it("keeps international numbers", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958")
  })

  it("returns null for blank and undefined for junk", () => {
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("12345")).toBeUndefined()
    expect(normalizePhone("call me")).toBeUndefined()
  })

  it("formats US numbers nationally and others internationally", () => {
    expect(formatPhone("+15035550123")).toBe("(503) 555-0123")
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958")
  })
})

describe("formatAddressLines", () => {
  it("builds mailing-label lines and hides a US country", () => {
    expect(
      formatAddressLines({
        addressLine1: "123 SW Main St",
        addressLine2: "Apt 4",
        city: "Portland",
        region: "OR",
        postalCode: "97204",
        country: "US",
      })
    ).toEqual(["123 SW Main St", "Apt 4", "Portland, OR 97204"])
  })

  it("skips blanks and keeps a non-US country", () => {
    expect(formatAddressLines({ city: "Vancouver", region: "BC", country: "Canada" })).toEqual([
      "Vancouver, BC",
      "Canada",
    ])
  })

  it("returns no lines for an empty address", () => {
    expect(formatAddressLines({})).toEqual([])
  })
})

describe("buildRosterCsv", () => {
  const base = {
    name: "Alex Van_Der_Berg",
    title: null,
    pronouns: null,
    email: null,
    languages: [],
    xHandle: null,
    blueskyHandle: null,
    linkedinSlug: null,
    instagramHandle: null,
    private: null,
  }

  it("starts with the header row", () => {
    expect(buildRosterCsv([])).toEqual([ROSTER_CSV_HEADER])
  })

  it("fills every column, formatted for reading", () => {
    const [, row] = buildRosterCsv([
      {
        ...base,
        title: "Business Editor",
        pronouns: "they/them",
        email: "alex@newsroom.com",
        languages: ["en", "es"],
        xHandle: "alex",
        linkedinSlug: "alex-vdb",
        private: {
          personalPhone: "+15035550123",
          personalEmail: "alex@example.com",
          addressLine1: "1 Main St",
          addressLine2: null,
          city: "Portland",
          region: "OR",
          postalCode: "97201",
          country: null,
        },
      },
    ])
    expect(row).toEqual([
      "Alex Van Der Berg", "Business Editor", "they/them", "alex@newsroom.com",
      "(503) 555-0123", "alex@example.com",
      "1 Main St", "", "Portland", "OR", "97201", "",
      "English; Spanish", "https://x.com/alex", "", "https://www.linkedin.com/in/alex-vdb/", "",
    ])
    expect(row).toHaveLength(ROSTER_CSV_HEADER.length)
  })

  it("leaves contact columns blank when there are no personal details", () => {
    const [, row] = buildRosterCsv([base])
    expect(row.slice(4, 12).every((c) => c === "")).toBe(true)
  })

  it("neutralizes formula-looking user input", () => {
    const [, row] = buildRosterCsv([{ ...base, title: "=1+1" }])
    expect(row[1]).toBe("'=1+1")
  })
})

describe("compareBySurname", () => {
  const order = (names: string[]) =>
    names.map((name) => ({ name })).sort(compareBySurname).map((p) => p.name)

  it("sorts by surname, not first name", () => {
    expect(order(["Sam Okafor", "Jamie Rivera", "Zoe Adams"])).toEqual([
      "Zoe Adams", "Sam Okafor", "Jamie Rivera",
    ])
  })

  it("files an underscore-joined multipart surname under its first word", () => {
    expect(order(["Pat Smith", "Ana de_la_Cruz", "Alex Van_Der_Berg", "Lee Dean"])).toEqual([
      "Ana de_la_Cruz", "Lee Dean", "Pat Smith", "Alex Van_Der_Berg",
    ])
  })

  it("breaks surname ties on the full name, ignoring case", () => {
    expect(order(["sam Lee", "Ana Lee", "Mary Ann Lee"])).toEqual(["Ana Lee", "Mary Ann Lee", "sam Lee"])
  })
})
