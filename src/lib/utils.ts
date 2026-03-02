import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

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

/** Assign a Date to a TIME_BUCKETS id using local time */
export function dateToBucket(date: Date): string {
  const minutes = date.getHours() * 60 + date.getMinutes();
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

/** Format a nullable pub date for display */
export function formatPubDate(
  date: Date | string | null | undefined,
  isTBD: boolean
): string {
  if (isTBD || !date) return "TBD";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy h:mm a");
}

/** Format a nullable print date (date only) for display */
export function formatPrintDate(
  date: Date | string | null | undefined,
  isTBD: boolean
): string {
  if (isTBD || !date) return "TBD";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

/** Today as YYYY-MM-DD in local time */
export function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
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

export const STORY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "In the works",
  SCHEDULED: "Scheduled",
  PUBLISHED_ITERATING: "Published (Iterating)",
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
