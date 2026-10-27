import { describe, it, expect } from "vitest"
import { OFFICE_LOCATION, hasMoved, roundCoord } from "@/lib/roster-map"

describe("roundCoord", () => {
  it("rounds to five decimals", () => {
    expect(roundCoord(45.123456789)).toBe(45.12346)
    expect(roundCoord(-122.677449)).toBe(-122.67745)
  })
})

describe("hasMoved", () => {
  it("ignores sub-precision jitter", () => {
    expect(
      hasMoved(OFFICE_LOCATION, {
        latitude: OFFICE_LOCATION.latitude + 1e-9,
        longitude: OFFICE_LOCATION.longitude - 1e-9,
      })
    ).toBe(false)
  })

  it("detects a move in either coordinate", () => {
    expect(hasMoved(OFFICE_LOCATION, { ...OFFICE_LOCATION, latitude: 45.52 })).toBe(true)
    expect(hasMoved(OFFICE_LOCATION, { ...OFFICE_LOCATION, longitude: -122.7 })).toBe(true)
  })
})
