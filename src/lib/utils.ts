import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIME_SLOTS = [
  "TBD",
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
  "11:00 PM",
] as const;

export type TimeSlotValue = (typeof TIME_SLOTS)[number];

/** Convert a time slot label to the hour (0–23), or null for TBD */
export function slotToHour(slot: string): number | null {
  if (slot === "TBD") return null;
  const match = slot.match(/^(\d+):00 (AM|PM)$/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  if (match[2] === "PM" && hour !== 12) hour += 12;
  if (match[2] === "AM" && hour === 12) hour = 0;
  return hour;
}

/** Convert an hour (0–23) to its TIME_SLOTS label, or TBD if unmatched */
export function hourToSlot(hour: number): string {
  const slot = TIME_SLOTS.find((s) => slotToHour(s) === hour);
  return slot ?? "TBD";
}

/** Given a Date (with time), return the TIME_SLOTS label for its hour */
export function dateToSlot(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return hourToSlot(d.getHours());
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
  DRAFT: "Draft",
  PUBLISHED_ITERATING: "Published (Iterating)",
  PUBLISHED_FINAL: "Published (Final)",
  SHELVED: "Shelved",
};

export const PERSON_ROLE_LABELS: Record<string, string> = {
  REPORTER: "Reporter",
  EDITOR: "Editor",
  PHOTOGRAPHER: "Photographer",
  GRAPHIC_DESIGNER: "Graphic Designer",
  PUBLICATION_DESIGNER: "Publication Designer",
  OTHER: "Other",
};
