import { describe, it, expect } from "vitest"
import {
  createPersonSchema,
  rosterLocationSchema,
  updatePersonSchema,
  updateRosterProfileSchema,
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
