import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import type { StoryListItem } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TimeBucket {
  id: string;
  label: string;
  description: string;
  /** Default local hour (0–23) to assign when dropping into this bucket, or null for TBD */
  defaultHour: number | null;
  defaultMinute: number | null;
  /** Inclusive start, in minutes from local midnight. Absent for TBD. */
  startMinutes?: number;
  /** Inclusive end, in minutes from local midnight. Absent for TBD. */
  endMinutes?: number;
}

export const TIME_BUCKETS: TimeBucket[] = [
  {
    id: "TBD",
    label: "TBD",
    description: "No publication time set",
    defaultHour: null,
    defaultMinute: null,
  },
  {
    id: "MORNING",
    label: "4–7:30 AM",
    description: "Morning newsletter deadline",
    defaultHour: 7,
    defaultMinute: 30,
    // Starts at local midnight (not 4 AM) so midnight–4 AM pub times — rare
    // but real — silently classify here instead of falling through to TBD.
    startMinutes: 0,
    endMinutes: 7 * 60 + 30,
  },
  {
    id: "MIDDAY",
    label: "7:30 AM–Noon",
    description: "Afternoon newsletter deadline",
    defaultHour: 12,
    defaultMinute: 0,
    startMinutes: 7 * 60 + 30,
    endMinutes: 12 * 60,
  },
  {
    id: "AFTERNOON",
    label: "Noon–5 PM",
    description: "Daily edition cutoff for most stories",
    defaultHour: 17,
    defaultMinute: 0,
    startMinutes: 12 * 60,
    endMinutes: 17 * 60,
  },
  {
    id: "EVENING",
    label: "5 PM & Later",
    description: "Consider holding for the morning",
    defaultHour: 23,
    defaultMinute: 0,
    startMinutes: 17 * 60,
    endMinutes: 24 * 60,
  },
];

/** Assign a Date to a TIME_BUCKETS id.
 *  All pub times are stored as "newsroom time encoded as UTC" (07:30Z = 7:30 AM
 *  newsroom time), so we always read UTC hours/minutes here. */
export function dateToBucket(date: Date): string {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  for (const bucket of TIME_BUCKETS) {
    if (bucket.startMinutes !== undefined && bucket.endMinutes !== undefined) {
      // Inclusive end: items exactly at a boundary (e.g. 7:30, 5:00 PM) go to the
      // earlier bucket because buckets are checked in order.
      if (minutes >= bucket.startMinutes && minutes <= bucket.endMinutes) {
        return bucket.id;
      }
    }
  }
  return "TBD";
}

/** Build the UTC ISO stamp for a bucket's default time on a given date
 *  (e.g. "2026-08-16" + "MORNING" -> "2026-08-16T07:30:00.000Z"), for
 *  assigning a plausible pub time when an item is dropped into a bucket
 *  without an exact time. Returns null for TBD or an unknown bucket id. */
export function bucketToUtcStamp(dateStr: string, bucketId: string): string | null {
  const bucket = TIME_BUCKETS.find((b) => b.id === bucketId);
  if (!bucket || bucket.defaultHour === null) return null;
  const h = String(bucket.defaultHour).padStart(2, "0");
  const m = String(bucket.defaultMinute ?? 0).padStart(2, "0");
  return `${dateStr}T${h}:${m}:00.000Z`;
}

/** Format a UTC-as-local ISO date as a short time string.
 *  Omits ":00" for on-the-hour times (e.g. "9 AM" not "9:00 AM"). */
export function formatTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const fake = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  return fake.getMinutes() === 0
    ? fake.toLocaleTimeString([], { hour: "numeric" })
    : fake.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Format a nullable pub date for display.
 *  Pub times are stored as "newsroom time encoded as UTC", so we read UTC
 *  fields and create a synthetic local Date to let date-fns format correctly. */
export function formatPubDate(
  date: Date | string | null | undefined,
  isTBD: boolean
): string {
  if (isTBD || !date) return "TBD";
  const d = typeof date === "string" ? new Date(date) : date;
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  const timePart = local.getMinutes() === 0
    ? local.toLocaleTimeString([], { hour: "numeric" })
    : local.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${format(local, "MMM d, yyyy")} ${timePart}`;
}

/** Format a nullable print date (date only) for display. */
export function formatPrintDate(
  date: Date | string | null | undefined,
  isTBD: boolean
): string {
  if (isTBD || !date) return "TBD";
  const d = typeof date === "string" ? new Date(date) : date;
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return format(local, "MMM d, yyyy");
}

/** Today as YYYY-MM-DD in Pacific Time (America/Los_Angeles) */
export function todayString(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Format a real instant (e.g. a comment's createdAt) in Pacific Time.
 *  Unlike formatPubDate, this must NOT read UTC fields — pub dates are
 *  "newsroom time encoded as UTC" but timestamps are genuine instants, so we
 *  convert properly via Intl. The year is included only when it isn't the
 *  current Pacific year. */
export function formatTimestampPacific(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).format(d);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    ...(year === todayString().slice(0, 4) ? {} : { year: "numeric" as const }),
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Full Pacific-time timestamp with weekday and zone — for title/tooltips. */
export function formatTimestampPacificLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/** Return initials from a full name (up to 2 chars) */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Render a full name for display, converting the underscore used to join a
 *  multipart surname back into a space. A multipart surname (e.g. "Van Der
 *  Berg") is stored as a single underscore-joined token ("Van_Der_Berg") so
 *  it survives a whitespace split as one word; use this anywhere a Person's
 *  raw `name` field is rendered — the underscore should never reach the
 *  screen. */
export function displayName(name: string): string {
  return name.replace(/_/g, " ");
}

/** Return the last word of a full name as the surname, with any
 *  underscore-joined multipart surname (see `displayName()`) converted back
 *  to spaces. */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return displayName(parts[parts.length - 1]);
}

/** Build a copy-paste budget line string for a story card.
 *  Format: "Slug: Budget line. 1,200 words. Photos by Smith. Jones & Williams/Martinez"
 *  - Reporters listed first, joined by " & "
 *  - Editor surname follows "/" with no extra label
 *  - "Photos by" uses surnames of photographers assigned to PHOTO visuals
 *  - Word count and photo credit omitted when absent */
export function formatBudgetLineCopy(story: StoryListItem): string {
  const parts: string[] = [];

  const slug = story.slug.replace(/-/g, " ");
  const budgetLine = (story.budgetLine ?? "").replace(/\.+$/, "");
  parts.push(`${slug}: ${budgetLine}`.trimEnd());

  if (story.wordCount) {
    parts.push(`${story.wordCount.toLocaleString()} words`);
  }

  const visualCredits: [string, string][] = [
    ["PHOTO",   "Photos by"],
    ["GRAPHIC", "Graphic by"],
    ["MAP",     "Map by"],
  ];
  for (const [type, label] of visualCredits) {
    const names = [
      ...new Set(
        story.visuals
          .filter((v) => v.type === type && v.person?.name)
          .map((v) => surname(v.person!.name).toUpperCase())
      ),
    ];
    if (names.length > 0) {
      parts.push(`${label} ${names.join(" & ")}`);
    }
  }

  const reporters = story.assignments
    .filter((a) => a.role === "REPORTER")
    .map((a) => surname(a.person.name).toUpperCase());
  const editors = story.assignments
    .filter((a) => a.role === "EDITOR")
    .map((a) => surname(a.person.name));

  if (reporters.length > 0 || editors.length > 0) {
    let peoplePart = reporters.join(" & ");
    if (editors.length > 0) {
      peoplePart = peoplePart
        ? `${peoplePart}/${editors.join(" & ")}`
        : `${editors.join(" & ")}/Editor`;
    }
    parts.push(peoplePart);
  }

  return parts.join(". ");
}

export const ROLE_ABBREV: Record<string, string> = {
  REPORTER:             "Rptr",
  EDITOR:               "Ed",
  PHOTOGRAPHER:         "Photo",
  VIDEOGRAPHER:         "Video",
  GRAPHIC_DESIGNER:     "Grafk",
  PUBLICATION_DESIGNER: "PubOps",
};

/** Map a Person.defaultRole to a valid story assignment role (REPORTER|EDITOR|VIDEOGRAPHER|OTHER). */
export function toStoryAssignmentRole(defaultRole: string): string {
  if (defaultRole === "REPORTER" || defaultRole === "EDITOR" || defaultRole === "VIDEOGRAPHER") return defaultRole
  return "OTHER"
}

/** Map a Person.defaultRole to a valid video assignment role (VIDEOGRAPHER|REPORTER|EDITOR|OTHER). */
export function toVideoAssignmentRole(defaultRole: string): string {
  if (defaultRole === "VIDEOGRAPHER" || defaultRole === "REPORTER" || defaultRole === "EDITOR") return defaultRole
  return "OTHER"
}

// ─── Story Indicators ──────────────────────────────────────────────────────────
// Single source of truth for the chips shown on StoryCard, the toggle picker in
// StoryForm, and the bulk-apply picker in the Daily view.
//
// "ENTERPRISE" and "AI_CONTRIBUTED" back real Story/Video boolean columns (they
// drive budget routing / auto-save, so stay typed columns). The rest are
// StoryTag rows (see prisma/schema.prisma) — editorial campaign labels that can
// be added or retired without a migration. Keep in sync with StoryTagEnum in
// src/lib/validations.ts.

export interface IndicatorOption {
  value: string
  label: string
  abbrev: string
  /** Tailwind classes for the active/filled chip state */
  color: string
  /** True for indicators that only apply to Story (not Video) */
  storyOnly: boolean
}

export const INDICATOR_OPTIONS: IndicatorOption[] = [
  { value: "ENTERPRISE", label: "Enterprise", abbrev: "Enterprise", storyOnly: false,
    color: "bg-secondary text-secondary-foreground" },
  { value: "AI_CONTRIBUTED", label: "AI Contributed", abbrev: "AI", storyOnly: true,
    color: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
  { value: "HERE_IS_OREGON", label: "Here is Oregon", abbrev: "HIO", storyOnly: true,
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400" },
  { value: "CONTENT_REMIX", label: "Content Remix", abbrev: "Remix", storyOnly: true,
    color: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" },
  { value: "SUMMER_FOCUS", label: "Summer Focus", abbrev: "Summer", storyOnly: true,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  { value: "OREGON_INSIGHT", label: "Oregon Insight", abbrev: "Insight", storyOnly: true,
    color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400" },
  { value: "VIDEO_POTENTIAL", label: "Video Potential", abbrev: "Vid Pot", storyOnly: true,
    color: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400" },
]

/** The StoryTag values within INDICATOR_OPTIONS (excludes ENTERPRISE/AI_CONTRIBUTED, which are boolean columns). */
export const STORY_TAG_VALUES = ["HERE_IS_OREGON", "CONTENT_REMIX", "SUMMER_FOCUS", "OREGON_INSIGHT", "VIDEO_POTENTIAL"] as const

export const STORY_TAG_LABELS: Record<string, string> = Object.fromEntries(
  INDICATOR_OPTIONS.filter((o) => STORY_TAG_VALUES.includes(o.value as typeof STORY_TAG_VALUES[number]))
    .map((o) => [o.value, o.label])
)

export const STORY_TAG_ABBREV: Record<string, string> = Object.fromEntries(
  INDICATOR_OPTIONS.filter((o) => STORY_TAG_VALUES.includes(o.value as typeof STORY_TAG_VALUES[number]))
    .map((o) => [o.value, o.abbrev])
)

export const STORY_TAG_COLOR: Record<string, string> = Object.fromEntries(
  INDICATOR_OPTIONS.filter((o) => STORY_TAG_VALUES.includes(o.value as typeof STORY_TAG_VALUES[number]))
    .map((o) => [o.value, o.color])
)

export const STORY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "In the works",
  SCHEDULED: "Scheduled",
  PUBLISHED_ITERATING: "Updating",
  PUBLISHED_FINAL: "Published (Final)",
  SHELVED: "Shelved",
};

export const PERSON_ROLE_LABELS: Record<string, string> = {
  REPORTER: "Reporter",
  EDITOR: "Editor",
  PHOTOGRAPHER: "Photographer",
  VIDEOGRAPHER: "Videographer",
  GRAPHIC_DESIGNER: "Graphic Designer",
  PUBLICATION_DESIGNER: "Publication Designer",
  OTHER: "Other",
  // Visual credit types (Story.visuals) — shown as a "role" on person/team content lists.
  PHOTO: "Photo",
  GRAPHIC: "Graphic",
  MAP: "Map",
  VIDEO: "Video",
};

/** Collapse duplicate visual credits (same story + visual type) for one person down to one entry each. */
export function dedupeVisualCredits<T extends { storyId: string; type: string }>(visuals: T[]): T[] {
  const seen = new Map<string, T>();
  for (const v of visuals) {
    const key = `${v.storyId}:${v.type}`;
    if (!seen.has(key)) seen.set(key, v);
  }
  return Array.from(seen.values());
}

export const TEAM_MEMBER_ROLE_LABELS: Record<string, string> = {
  EDITOR: "Editor",
  MEMBER: "Member",
};

// ─── App Role Permissions ─────────────────────────────────────────────────────

export const APP_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  LEADERSHIP: "Leadership",
  MANAGING_PRODUCER: "Managing Producer",
  SUPERVISOR: "Supervisor",
  PRODUCER: "Producer",
  VIEWER: "Viewer",
}

/** Roles with admin panel access (manage users + teams). */
const ADMIN_ROLES = ["ADMIN", "LEADERSHIP"] as const

export function hasAdminAccess(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

/** Whether the role can view/edit Editions and print publication dates. */
export function canEditPrint(role: string): boolean {
  return hasAdminAccess(role)
}

const ELEVATED_ROLES = ["ADMIN", "LEADERSHIP", "MANAGING_PRODUCER", "SUPERVISOR"] as const
const CONTENT_CREATOR_ROLES = ["ADMIN", "LEADERSHIP", "MANAGING_PRODUCER", "SUPERVISOR", "PRODUCER"] as const
const TEAMS_ROLES = ["ADMIN", "LEADERSHIP", "MANAGING_PRODUCER", "SUPERVISOR"] as const

/** Whether the role has elevated privileges (e.g. media request actions). */
export function hasElevatedAccess(role: string): boolean {
  return (ELEVATED_ROLES as readonly string[]).includes(role)
}

/** Whether the My Teams nav item is visible for this role. */
export function canViewMyTeams(role: string): boolean {
  return (TEAMS_ROLES as readonly string[]).includes(role)
}

/** Whether the role can create or edit content (stories, videos). */
export function canCreateContent(role: string): boolean {
  return (CONTENT_CREATOR_ROLES as readonly string[]).includes(role)
}

/** Whether the People directory (nav item + page) is visible for this role. Hidden from VIEWER and PRODUCER. */
export function canViewPeople(role: string): boolean {
  return hasElevatedAccess(role)
}
