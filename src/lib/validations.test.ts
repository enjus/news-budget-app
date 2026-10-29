import { describe, it, expect } from "vitest"
import { createPersonSchema, requestVisualSchema, rosterLocationSchema, updatePersonSchema, updateVisualSchema } from "@/lib/validations"

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
