import { parsePhoneNumberFromString } from "libphonenumber-js/min"
import { safeCsvText } from "@/lib/csv"
import { languageLabel } from "@/lib/languages"
import { displayName } from "@/lib/utils"

// Pure helpers for the roster profile (/roster): normalizing what people paste
// into the social-handle and phone fields, and building the links/strings the
// UI renders from the stored values. Covered by src/lib/roster.test.ts.

export type SocialPlatform = "x" | "bluesky" | "linkedin" | "instagram"

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: "X",
  bluesky: "Bluesky",
  linkedin: "LinkedIn",
  instagram: "Instagram",
}

const HANDLE_PATTERNS: Record<SocialPlatform, RegExp> = {
  x: /^[A-Za-z0-9_]{1,15}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  // A domain handle (name.bsky.social, or a custom domain) or a raw DID.
  bluesky: /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]|did:plc:[a-z2-7]{24})$/,
  // Non-ASCII vanity slugs arrive percent-encoded when copied from the address bar.
  linkedin: /^[A-Za-z0-9\-_%]{3,100}$/,
}

// Hosts whose profile URLs we accept on paste, and the path prefix before the handle.
const URL_FORMS: Record<SocialPlatform, { hosts: string[]; prefix: string }> = {
  x: { hosts: ["x.com", "twitter.com"], prefix: "/" },
  instagram: { hosts: ["instagram.com"], prefix: "/" },
  bluesky: { hosts: ["bsky.app"], prefix: "/profile/" },
  linkedin: { hosts: ["linkedin.com"], prefix: "/in/" },
}

/**
 * Normalize a pasted handle or profile URL to the bare stored handle.
 * Returns null for blank input and undefined when the input isn't a valid
 * handle for the platform (the caller turns that into a validation error).
 *
 *   "@foo", "foo", "https://x.com/foo?s=20"      → "foo"         (x)
 *   "linkedin.com/in/jane-doe/"                   → "jane-doe"    (linkedin)
 *   "https://bsky.app/profile/Name.bsky.social"   → "name.bsky.social"
 */
export function normalizeHandle(
  platform: SocialPlatform,
  input: string | null | undefined
): string | null | undefined {
  let value = (input ?? "").trim()
  if (value === "") return null

  const fromUrl = handleFromUrl(platform, value)
  if (fromUrl !== null) value = fromUrl

  value = value.replace(/^@/, "")
  if (platform === "bluesky") value = value.toLowerCase()

  return HANDLE_PATTERNS[platform].test(value) ? value : undefined
}

/** The handle segment of a recognized profile URL, or null if `value` isn't one. */
function handleFromUrl(platform: SocialPlatform, value: string): string | null {
  const { hosts, prefix } = URL_FORMS[platform]
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|mobile\.|m\.)/, "")
  if (!hosts.includes(host)) return null
  if (!url.pathname.startsWith(prefix)) return null
  return url.pathname.slice(prefix.length).split("/")[0] ?? ""
}

/** Profile URL for a stored handle. */
export function socialUrl(platform: SocialPlatform, handle: string): string {
  switch (platform) {
    case "x":
      return `https://x.com/${handle}`
    case "instagram":
      return `https://www.instagram.com/${handle}/`
    case "bluesky":
      return `https://bsky.app/profile/${handle}`
    case "linkedin":
      return `https://www.linkedin.com/in/${handle}/`
  }
}

/** Display form of a stored handle: "@foo" for X/Instagram/Bluesky, bare slug for LinkedIn. */
export function socialDisplay(platform: SocialPlatform, handle: string): string {
  return platform === "linkedin" ? handle : `@${handle}`
}

/**
 * Normalize a typed phone number to E.164, assuming US when no country code
 * is given. Returns null for blank input, undefined when it isn't a valid number.
 */
export function normalizePhone(input: string | null | undefined): string | null | undefined {
  const value = (input ?? "").trim()
  if (value === "") return null
  const parsed = parsePhoneNumberFromString(value, "US")
  return parsed?.isValid() ? parsed.number : undefined
}

/** "+15035550123" → "(503) 555-0123"; non-US numbers in international form. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed) return e164
  return parsed.country === "US" ? parsed.formatNational() : parsed.formatInternational()
}

export interface AddressParts {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  country?: string | null
}

/** Mailing-label lines for an address, skipping blanks. Empty array = no address. */
export function formatAddressLines(a: AddressParts): string[] {
  const cityLine = [
    a.city,
    [a.region, a.postalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")
  const country = a.country && !/^(us|usa|united states)$/i.test(a.country) ? a.country : null
  return [a.addressLine1, a.addressLine2, cityLine, country].filter(
    (line): line is string => !!line && line.trim() !== ""
  )
}

// ─── CSV export ─────────────────────────────────────────────────────────────

/** The fields buildRosterCsv() reads — a RosterProfile without the user link. */
export interface RosterCsvPerson extends SocialHandles {
  name: string
  title: string | null
  pronouns: string | null
  email: string | null
  languages: string[]
  private: (AddressParts & { personalPhone: string | null; personalEmail: string | null }) | null
}

interface SocialHandles {
  xHandle: string | null
  blueskyHandle: string | null
  linkedinSlug: string | null
  instagramHandle: string | null
}

export const ROSTER_CSV_HEADER = [
  "Name", "Title", "Pronouns", "Work email",
  "Personal phone", "Personal email",
  "Address line 1", "Address line 2", "City", "State/region", "ZIP/postal code", "Country",
  "Languages", "X", "Bluesky", "LinkedIn", "Instagram",
]

/**
 * Roster rows for the offline-backup CSV (/api/roster/export), header first.
 * Every user-entered cell goes through safeCsvText() (formula-injection
 * guard). Phones are formatted for reading, social accounts as full URLs so
 * they work when clicked from a spreadsheet.
 */
export function buildRosterCsv(people: RosterCsvPerson[]): string[][] {
  const rows = people.map((p) => {
    const priv = p.private
    const social = (platform: SocialPlatform, handle: string | null) =>
      handle ? socialUrl(platform, handle) : ""
    return [
      displayName(p.name),
      p.title ?? "",
      p.pronouns ?? "",
      p.email ?? "",
      priv?.personalPhone ? formatPhone(priv.personalPhone) : "",
      priv?.personalEmail ?? "",
      priv?.addressLine1 ?? "",
      priv?.addressLine2 ?? "",
      priv?.city ?? "",
      priv?.region ?? "",
      priv?.postalCode ?? "",
      priv?.country ?? "",
      p.languages.map(languageLabel).join("; "),
      social("x", p.xHandle),
      social("bluesky", p.blueskyHandle),
      social("linkedin", p.linkedinSlug),
      social("instagram", p.instagramHandle),
    ].map(safeCsvText)
  })
  return [ROSTER_CSV_HEADER, ...rows]
}
