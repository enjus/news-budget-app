import { describe, it, expect } from "vitest"
import {
  createPersonSchema,
  requestVisualSchema,
  rosterLocationSchema,
  updatePersonSchema,
  updateRosterProfileSchema,
  updateVisualSchema,
} from "@/lib/validations"

describe("rosterLocationSchema", () => {
  it("accepts a valid pin", () => {
    expect(rosterLocationSchema.parse({ latitude: 45.5, longitude: -122.6 })).toEqual({
      latitude: 45.5,
      longitude: -122.6,
    })
  })

  it("rejects out-of-range, non-numeric, and half-set coordinates", () => {
    expect(rosterLocationSchema.safeParse({ latitude: 91, longitude: 0 }).success).toBe(false)
    expect(rosterLocationSchema.safeParse({ latitude: 0, longitude: -181 }).success).toBe(false)
    expect(rosterLocationSchema.safeParse({ latitude: NaN, longitude: 0 }).success).toBe(false)
    expect(rosterLocationSchema.safeParse({ latitude: "45.5", longitude: "-122.6" }).success).toBe(false)
    expect(rosterLocationSchema.safeParse({ latitude: 45.5 }).success).toBe(false)
  })
})

// Regression: Zod v4's .partial() keeps .default(), so updatePersonSchema
// used to fill in defaultRole: "OTHER" on every status-only PATCH (Mark
// inactive, Add to staff), silently resetting the person's role.
describe("updatePersonSchema", () => {
  it("leaves defaultRole out of a status-only update", () => {
    expect(updatePersonSchema.parse({ isActive: false })).toEqual({ isActive: false })
    expect(updatePersonSchema.parse({ isStaff: true })).toEqual({ isStaff: true })
  })

  it("still accepts an explicit role change", () => {
    expect(updatePersonSchema.parse({ defaultRole: "EDITOR" })).toEqual({ defaultRole: "EDITOR" })
  })

  it("keeps the OTHER default when creating", () => {
    expect(createPersonSchema.parse({ kind: "contributor", name: "New Person" }).defaultRole).toBe("OTHER")
  })
})

describe("createPersonSchema", () => {
  it("requires a work email for staff", () => {
    expect(createPersonSchema.safeParse({ kind: "staff", name: "A" }).success).toBe(false)
    expect(createPersonSchema.safeParse({ kind: "staff", name: "A", email: "" }).success).toBe(false)
    expect(createPersonSchema.parse({ kind: "staff", name: "A", email: "a@x.com" })).toEqual({
      kind: "staff",
      name: "A",
      email: "a@x.com",
      defaultRole: "OTHER",
    })
  })

  it("allows an optional work email on a contributor", () => {
    expect(
      createPersonSchema.parse({ kind: "contributor", name: "C", email: "c@freelance.example" })
    ).toMatchObject({ email: "c@freelance.example" })
    expect(createPersonSchema.parse({ kind: "contributor", name: "C", email: "" })).toMatchObject({
      email: null,
    })
    expect(createPersonSchema.parse({ kind: "contributor", name: "C" }).email).toBeUndefined()
    expect(
      createPersonSchema.safeParse({ kind: "contributor", name: "C", email: "not-an-email" }).success
    ).toBe(false)
  })

  it("rejects unknown fields on a contributor", () => {
    expect(
      createPersonSchema.safeParse({ kind: "contributor", name: "C", isStaff: true }).success
    ).toBe(false)
  })

  it("tells a missing staff email apart from a malformed one", () => {
    const missing = createPersonSchema.safeParse({ kind: "staff", name: "A", email: "" })
    const malformed = createPersonSchema.safeParse({ kind: "staff", name: "A", email: "jane@" })
    expect(missing.success || missing.error.issues[0].message).toBe("A work email is required")
    expect(malformed.success || malformed.error.issues[0].message).toBe("Invalid email address")
  })

  it("requires a kind", () => {
    expect(createPersonSchema.safeParse({ name: "No kind" }).success).toBe(false)
  })
})

describe("work email trimming", () => {
  it("trims a pasted email on edit, like on create", () => {
    expect(updatePersonSchema.parse({ email: "  jane@oregonian.com " })).toEqual({ email: "jane@oregonian.com" })
    expect(updatePersonSchema.parse({ email: "   " })).toEqual({ email: null })
  })
})

describe("updateRosterProfileSchema contributor record fields", () => {
  it("leaves name, email and role out when absent (a staffer's form)", () => {
    const parsed = updateRosterProfileSchema.parse({ title: "Reporter" })
    expect(parsed.name).toBeUndefined()
    expect(parsed.email).toBeUndefined()
    expect(parsed.defaultRole).toBeUndefined()
  })

  it("accepts them and turns a blank email into null", () => {
    expect(
      updateRosterProfileSchema.parse({ name: "Riley Park", email: "", defaultRole: "REPORTER" })
    ).toMatchObject({ name: "Riley Park", email: null, defaultRole: "REPORTER" })
  })

  it("rejects a blank name or a bad email", () => {
    expect(updateRosterProfileSchema.safeParse({ name: "" }).success).toBe(false)
    expect(updateRosterProfileSchema.safeParse({ email: "nope" }).success).toBe(false)
  })
})

describe("requestVisualSchema", () => {
  const base = { status: "REQUESTED", type: "PHOTO" }

  it("defaults priority to NORMAL and nulls an absent link", () => {
    const parsed = requestVisualSchema.parse(base)
    expect(parsed.priority).toBe("NORMAL")
    expect(parsed.dataUrl).toBeUndefined()
  })

  it("normalizes a valid data link and turns a blank one into null", () => {
    expect(requestVisualSchema.parse({ ...base, dataUrl: " HTTPS://Example.com/d " }).dataUrl).toBe("https://example.com/d")
    expect(requestVisualSchema.parse({ ...base, dataUrl: "  " }).dataUrl).toBeNull()
  })

  it("rejects an unsafe data link with a field error", () => {
    const r = requestVisualSchema.safeParse({ ...base, dataUrl: "javascript:alert(1)" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.flatten().fieldErrors.dataUrl).toBeTruthy()
  })

  it("only accepts status REQUESTED and ignores a personId", () => {
    expect(requestVisualSchema.safeParse({ ...base, status: "ASSIGNED" }).success).toBe(false)
    expect(requestVisualSchema.parse({ ...base, personId: "x" })).not.toHaveProperty("personId")
  })

  it("requires offset datetimes for deadline and eventDateTime", () => {
    expect(requestVisualSchema.safeParse({ ...base, deadline: "2026-11-02T17:00:00.000Z" }).success).toBe(true)
    expect(requestVisualSchema.safeParse({ ...base, deadline: "tomorrow" }).success).toBe(false)
    expect(requestVisualSchema.safeParse({ ...base, eventDateTime: "2026-11-02" }).success).toBe(false)
  })
})

// Regression: spelled out instead of createVisualSchema.partial(), because
// Zod v4's .partial() keeps defaults and would reset priority on every edit.
describe("updateVisualSchema", () => {
  it("leaves unsent fields out, including priority and dataUrl", () => {
    expect(updateVisualSchema.parse({ notes: "hi" })).toEqual({ notes: "hi" })
  })

  it("distinguishes clearing the link (null) from not sending it", () => {
    expect(updateVisualSchema.parse({ dataUrl: "" })).toEqual({ dataUrl: null })
    expect(updateVisualSchema.parse({ dataUrl: null })).toEqual({ dataUrl: null })
  })

  it("requires a non-blank declineReason when declining", () => {
    expect(updateVisualSchema.safeParse({ status: "DECLINED" }).success).toBe(false)
    expect(updateVisualSchema.safeParse({ status: "DECLINED", declineReason: "   " }).success).toBe(false)
    expect(updateVisualSchema.safeParse({ status: "DECLINED", declineReason: "No staff" }).success).toBe(true)
  })

  it("rejects a declineReason on any other status", () => {
    expect(updateVisualSchema.safeParse({ declineReason: "x" }).success).toBe(false)
    expect(updateVisualSchema.safeParse({ status: "CANCELED", declineReason: "x" }).success).toBe(false)
  })

  it("rejects unknown statuses and a null-clearable personId passes through", () => {
    expect(updateVisualSchema.safeParse({ status: "BOGUS" }).success).toBe(false)
    expect(updateVisualSchema.parse({ personId: null })).toEqual({ personId: null })
  })
})
