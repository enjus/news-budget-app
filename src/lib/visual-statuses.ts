// Visual request statuses (issue #23, slice 1): what each status *means* to the
// rest of the app. No imports on purpose — lib/utils.ts needs these helpers and
// visual-requests.ts needs utils.ts, so they live here to avoid a cycle.
// Everything that decides how a status behaves is in this one file.

export const VISUAL_STATUSES = [
  "PLANNED",
  "REQUESTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "DELIVERED",
  "DECLINED",
  "CANCELED",
] as const

export type VisualStatus = (typeof VISUAL_STATUSES)[number]

/** Display names for the status badge. */
export const VISUAL_STATUS_LABELS: Record<VisualStatus, string> = {
  PLANNED: "Planned",
  REQUESTED: "Requested",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  DECLINED: "Declined",
  CANCELED: "Canceled",
}

/** Still a live piece of work on the story: counts toward card indicators. */
export const ACTIVE_STATUSES: readonly VisualStatus[] = [
  "PLANNED", "REQUESTED", "ASSIGNED", "IN_PROGRESS", "DELIVERED",
]

/** Counts as a credit ("Photos by…", person/team content lists). */
export const CREDITED_STATUSES: readonly VisualStatus[] = ["PLANNED", "DELIVERED"]

/** The assignee is emailed about story updates and comments. REQUESTED has no assignee yet. */
export const NOTIFIABLE_STATUSES: readonly VisualStatus[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "DELIVERED",
]

/** Terminal statuses: no further transitions, and the only ones that may be deleted. */
export const TERMINAL_STATUSES: readonly VisualStatus[] = ["DELIVERED", "DECLINED", "CANCELED"]

/** Real work exists, so these survive a story delete as unplaced (`storyId = null`). The rest die with the story. */
export const UNPLACE_ON_STORY_DELETE_STATUSES: readonly VisualStatus[] = ["IN_PROGRESS", "DELIVERED"]

/** Statuses a new row may be created with. */
export const CREATABLE_STATUSES: readonly VisualStatus[] = ["PLANNED", "REQUESTED"]

const TRANSITIONS: Record<VisualStatus, readonly VisualStatus[]> = {
  PLANNED: [],
  REQUESTED: ["ASSIGNED", "DECLINED", "CANCELED"],
  ASSIGNED: ["IN_PROGRESS", "DECLINED", "CANCELED"], // reassigning stays ASSIGNED
  IN_PROGRESS: ["DELIVERED", "CANCELED"],
  DELIVERED: [],
  DECLINED: [],
  CANCELED: [],
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function isVisualStatus(value: unknown): value is VisualStatus {
  return typeof value === "string" && (VISUAL_STATUSES as readonly string[]).includes(value)
}

// An unknown status (e.g. a typo'd row) is in no set, so it's treated as inert.
export const isActiveStatus = (status: string): boolean => (ACTIVE_STATUSES as readonly string[]).includes(status)
export const isCreditedStatus = (status: string): boolean => (CREDITED_STATUSES as readonly string[]).includes(status)
export const isNotifiableStatus = (status: string): boolean => (NOTIFIABLE_STATUSES as readonly string[]).includes(status)
export const isTerminalStatus = (status: string): boolean => (TERMINAL_STATUSES as readonly string[]).includes(status)

/** Whether `from` → `to` is a legal status change. Same-status is not a transition (reassign is a personId change). */
export function canTransition(from: string, to: string): boolean {
  if (!isVisualStatus(from)) return false
  return (TRANSITIONS[from] as readonly string[]).includes(to)
}

// ─── Story delete ─────────────────────────────────────────────────────────────

/**
 * Splits a story's visuals for the story-delete transaction: `unplaceIds` keep
 * their row with `storyId = null`, `deleteIds` go with the story.
 */
export function partitionVisualsForStoryDelete(
  visuals: { id: string; status: string }[],
): { deleteIds: string[]; unplaceIds: string[] } {
  const deleteIds: string[] = []
  const unplaceIds: string[] = []
  for (const v of visuals) {
    if ((UNPLACE_ON_STORY_DELETE_STATUSES as readonly string[]).includes(v.status)) unplaceIds.push(v.id)
    else deleteIds.push(v.id)
  }
  return { deleteIds, unplaceIds }
}

