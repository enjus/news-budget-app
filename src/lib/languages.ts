// Languages selectable on a roster profile (Person.languages). Stored as
// BCP-47 codes; labels are English and hard-coded rather than derived from
// Intl.DisplayNames so server and client render identical text. Add entries
// freely — codes are validated against this list at the API layer only, so a
// removed code still renders (via languageLabel's fallback) on profiles that
// already carry it.

export const ROSTER_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "vi", label: "Vietnamese" },
  { code: "zh", label: "Chinese (Mandarin)" },
  { code: "yue", label: "Chinese (Cantonese)" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ar", label: "Arabic" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "tl", label: "Tagalog" },
  { code: "so", label: "Somali" },
  { code: "am", label: "Amharic" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "pl", label: "Polish" },
  { code: "fa", label: "Persian (Farsi)" },
  { code: "hi", label: "Hindi" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "bn", label: "Bengali" },
  { code: "km", label: "Khmer" },
  { code: "lo", label: "Lao" },
  { code: "th", label: "Thai" },
  { code: "hmn", label: "Hmong" },
  { code: "chk", label: "Chuukese" },
  { code: "mh", label: "Marshallese" },
  { code: "sm", label: "Samoan" },
  { code: "to", label: "Tongan" },
  { code: "he", label: "Hebrew" },
  { code: "tr", label: "Turkish" },
  { code: "sw", label: "Swahili" },
  { code: "ht", label: "Haitian Creole" },
  { code: "nv", label: "Navajo" },
  { code: "ase", label: "American Sign Language" },
] as const

export type RosterLanguageCode = (typeof ROSTER_LANGUAGES)[number]["code"]

export const ROSTER_LANGUAGE_CODES = ROSTER_LANGUAGES.map((l) => l.code) as [
  RosterLanguageCode,
  ...RosterLanguageCode[],
]

const LABELS: Record<string, string> = Object.fromEntries(
  ROSTER_LANGUAGES.map((l) => [l.code, l.label])
)

/** English label for a stored language code; falls back to the raw code. */
export function languageLabel(code: string): string {
  return LABELS[code] ?? code
}
