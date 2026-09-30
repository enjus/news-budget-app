// Admin-managed editorial tags — shared vocabulary for the Tag table
// (prisma/schema.prisma), the admin panel, and every chip/picker that renders
// one. Client-safe: no Prisma imports here (see tags-server.ts).
//
// Colors and icons are stored in the DB as *keys* into the fixed maps below,
// never as raw class names or icon names: Tailwind only generates classes it
// can see written out literally in source, so the palette has to live in code.

/** Chip palette. Neutral gray (Enterprise, Post/Draft/word-count chips) and
 *  violet (AI Contributed) are deliberately absent so admin tags can't be
 *  mistaken for those built-in indicators. */
export const TAG_COLORS = {
  red:     { label: "Red",     chip: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",             swatch: "bg-red-400" },
  orange:  { label: "Orange",  chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400", swatch: "bg-orange-400" },
  amber:   { label: "Amber",   chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",     swatch: "bg-amber-400" },
  yellow:  { label: "Yellow",  chip: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400", swatch: "bg-yellow-400" },
  lime:    { label: "Lime",    chip: "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-400",         swatch: "bg-lime-400" },
  emerald: { label: "Emerald", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", swatch: "bg-emerald-400" },
  teal:    { label: "Teal",    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",         swatch: "bg-teal-400" },
  sky:     { label: "Sky",     chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",             swatch: "bg-sky-400" },
  blue:    { label: "Blue",    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",         swatch: "bg-blue-400" },
  indigo:  { label: "Indigo",  chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400", swatch: "bg-indigo-400" },
  fuchsia: { label: "Fuchsia", chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400", swatch: "bg-fuchsia-400" },
  pink:    { label: "Pink",    chip: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400",         swatch: "bg-pink-400" },
} as const

export type TagColorKey = keyof typeof TAG_COLORS
export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as [TagColorKey, ...TagColorKey[]]

/** Icon choices — the lucide components live in src/components/tags/tag-icons.ts. */
export const TAG_ICON_KEYS = [
  "map-pin", "repeat", "sun", "landmark", "clapperboard", "bell-ring",
  "star", "flag", "flame", "trophy", "heart", "leaf",
  "mountain", "trees", "newspaper", "megaphone", "vote", "graduation-cap",
  "utensils", "music", "zap", "target", "bookmark", "calendar",
  "users", "lightbulb", "search", "scale",
] as const

export type TagIconKey = typeof TAG_ICON_KEYS[number]

/** Keys a Tag may never take — these are Story/Video boolean columns with
 *  special behavior (budget routing, compliance), not Tag rows. */
export const RESERVED_TAG_KEYS = ["ENTERPRISE", "AI_CONTRIBUTED"] as const

export interface TagDefinition {
  key: string
  label: string
  abbrev: string | null
  color: string
  icon: string | null
  sortOrder: number
}

/** The tags that were hard-coded before the admin panel existed. Their keys
 *  match existing StoryTag rows, so no data migration is needed —
 *  ensureDefaultTags() inserts whichever of these are missing. */
export const DEFAULT_TAGS: TagDefinition[] = [
  { key: "HERE_IS_OREGON",  label: "Here is Oregon",  abbrev: "HIO",     color: "yellow",  icon: "map-pin",      sortOrder: 0 },
  { key: "CONTENT_REMIX",   label: "Content Remix",   abbrev: "Remix",   color: "orange",  icon: "repeat",       sortOrder: 1 },
  { key: "SUMMER_FOCUS",    label: "Summer Focus",    abbrev: "Summer",  color: "emerald", icon: "sun",          sortOrder: 2 },
  { key: "OREGON_INSIGHT",  label: "Oregon Insight",  abbrev: "Insight", color: "sky",     icon: "landmark",     sortOrder: 3 },
  { key: "VIDEO_POTENTIAL", label: "Video Potential", abbrev: "Vid Pot", color: "pink",    icon: "clapperboard", sortOrder: 4 },
  { key: "PUSHED",          label: "Pushed",          abbrev: "Pushed",  color: "red",     icon: "bell-ring",    sortOrder: 5 },
]

/** "Here is Oregon" → "HERE_IS_OREGON". Accents are folded, anything that
 *  isn't A–Z/0–9 becomes a single underscore. Returns "" if nothing usable. */
export function labelToTagKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export const TAG_KEY_PATTERN = /^[A-Z0-9]+(_[A-Z0-9]+)*$/

/** URL segment for a tag's view: HERE_IS_OREGON → here-is-oregon. */
export function tagKeyToSlug(key: string): string {
  return key.toLowerCase().replace(/_/g, "-")
}

/** Inverse of tagKeyToSlug. */
export function tagSlugToKey(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_")
}

export function tagHref(key: string): string {
  return `/tags/${tagKeyToSlug(key)}`
}

/** Chip classes for a stored color key; unknown keys fall back to neutral. */
export function tagChipClass(color: string | null | undefined): string {
  return (color && color in TAG_COLORS)
    ? TAG_COLORS[color as TagColorKey].chip
    : "bg-secondary text-secondary-foreground"
}

/** Humanize a key for display when its Tag row is missing: PUSHED → "Pushed". */
export function humanizeTagKey(key: string): string {
  const s = key.toLowerCase().replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}
