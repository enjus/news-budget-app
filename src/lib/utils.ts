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
    startMinutes: 4 * 60,
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

/** Return initials from a full name (up to 2 chars) */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Return the last word of a full name as the surname */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
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
  parts.push(`${slug}: ${story.budgetLine ?? ""}`.trimEnd());

  if (story.wordCount) {
    parts.push(`${story.wordCount.toLocaleString()} words`);
  }

  const photographers = [
    ...new Set(
      story.visuals
        .filter((v) => v.type === "PHOTO" && v.person?.name)
        .map((v) => surname(v.person!.name))
    ),
  ];
  if (photographers.length > 0) {
    parts.push(`Photos by ${photographers.join(" & ")}`);
  }

  const reporters = story.assignments
    .filter((a) => a.role === "REPORTER")
    .map((a) => surname(a.person.name));
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
};

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

/** Whether the role has elevated privileges (e.g. media request actions). */
export function hasElevatedAccess(role: string): boolean {
  return role !== "PRODUCER"
}

/** Whether the My Teams nav item is visible for this role. */
export function canViewMyTeams(role: string): boolean {
  return role !== "PRODUCER" && role !== "VIEWER"
}

/** Whether the role can create or edit content (stories, videos). */
export function canCreateContent(role: string): boolean {
  return role !== "VIEWER"
}
