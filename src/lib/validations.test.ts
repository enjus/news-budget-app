import { describe, it, expect } from "vitest"
import { createPersonSchema, updatePersonSchema } from "@/lib/validations"

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
