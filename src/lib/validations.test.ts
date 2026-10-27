import { describe, it, expect } from "vitest"
import { createPersonSchema, rosterLocationSchema, updatePersonSchema } from "@/lib/validations"

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
    expect(createPersonSchema.parse({ name: "New Person" }).defaultRole).toBe("OTHER")
  })
})
