import { describe, it, expect } from "vitest"
import {
  labelToTagKey, tagKeyToSlug, tagSlugToKey, TAG_KEY_PATTERN,
  DEFAULT_TAGS, TAG_COLOR_KEYS, TAG_ICON_KEYS, RESERVED_TAG_KEYS,
} from "@/lib/tags"

describe("labelToTagKey", () => {
  it("upper-snakes a label", () => {
    expect(labelToTagKey("Here is Oregon")).toBe("HERE_IS_OREGON")
  })

  it("collapses punctuation and whitespace runs and trims edges", () => {
    expect(labelToTagKey("  Election '26 — Results!  ")).toBe("ELECTION_26_RESULTS")
  })

  it("folds accents", () => {
    expect(labelToTagKey("Día de los Muertos")).toBe("DIA_DE_LOS_MUERTOS")
  })

  it("returns empty for labels with nothing usable", () => {
    expect(labelToTagKey("—!?")).toBe("")
  })

  it("maps the built-in indicator names onto the reserved keys", () => {
    expect(RESERVED_TAG_KEYS).toContain(labelToTagKey("Enterprise"))
    expect(RESERVED_TAG_KEYS).toContain(labelToTagKey("AI contributed"))
  })

  it("always produces a key matching TAG_KEY_PATTERN", () => {
    for (const label of ["A", "Summer 2026", "x-y z", "  9 lives "]) {
      expect(labelToTagKey(label)).toMatch(TAG_KEY_PATTERN)
    }
  })
})

describe("tag slugs", () => {
  it("round-trips keys through URL slugs", () => {
    for (const key of ["HERE_IS_OREGON", "PUSHED", "ELECTION_2026"]) {
      expect(tagSlugToKey(tagKeyToSlug(key))).toBe(key)
    }
    expect(tagKeyToSlug("HERE_IS_OREGON")).toBe("here-is-oregon")
  })
})

describe("DEFAULT_TAGS", () => {
  it("keeps the original keys, which match existing StoryTag rows", () => {
    expect(DEFAULT_TAGS.map((t) => t.key)).toEqual([
      "HERE_IS_OREGON", "CONTENT_REMIX", "SUMMER_FOCUS", "OREGON_INSIGHT", "VIDEO_POTENTIAL", "PUSHED",
    ])
  })

  it("only uses palette colors and known icons", () => {
    for (const t of DEFAULT_TAGS) {
      expect(TAG_COLOR_KEYS).toContain(t.color)
      expect(TAG_ICON_KEYS).toContain(t.icon)
    }
  })
})
