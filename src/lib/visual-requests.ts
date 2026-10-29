// Visual requests (issue #23, slice 1): permissions, assignment and the data-link
// check for Visual rows. Pure functions only — see docs/visual-requests-slice-1.md.
// The status sets and transition table are in ./visual-statuses (re-exported here).
import { canCreateContent, hasAdminAccess, hasElevatedAccess } from "./utils"
import { isTerminalStatus } from "./visual-statuses"

export * from "./visual-statuses"

// ─── Permissions ──────────────────────────────────────────────────────────────

export type VisualAction =
  | "update"   // edit details (type, description, notes, dataUrl, …)
  | "assign"   // set or change personId
  | "advance"  // → IN_PROGRESS, → DELIVERED
  | "decline"
  | "cancel"
  | "delete"

export interface VisualActor {
  role: string
  /** `session.user.personId` — null when the account isn't linked to a Person. */
  personId: string | null
}

/** The fields of a Visual the permission rules read. */
export interface VisualPermissionTarget {
  status: string
  personId: string | null
  requestedById: string | null
}

/**
 * Who may do what to a visual. PLANNED rows keep today's rules: any content
 * creator can edit or delete them (that is how "Add" and its remove button work).
 * REQUESTED and later follow the issue's permissions table. Doesn't check
 * whether the *transition* is legal — pair with canTransition().
 */
export function canActOnVisual(actor: VisualActor, visual: VisualPermissionTarget, action: VisualAction): boolean {
  if (!canCreateContent(actor.role)) return false

  if (visual.status === "PLANNED") {
    return action === "update" || action === "assign" || action === "delete"
  }

  const isAssignee = actor.personId !== null && visual.personId === actor.personId
  const isRequester = actor.personId !== null && visual.requestedById === actor.personId

  switch (action) {
    case "update":
      return isRequester || hasElevatedAccess(actor.role)
    case "assign":
      return hasElevatedAccess(actor.role) || isAssignee
    case "advance":
      return isAssignee || hasElevatedAccess(actor.role)
    case "decline":
      return hasElevatedAccess(actor.role)
    case "cancel":
      return isRequester || hasAdminAccess(actor.role)
    case "delete":
      return hasAdminAccess(actor.role) && isTerminalStatus(visual.status)
  }
}

// ─── Assignment ───────────────────────────────────────────────────────────────

export type Assignable = { ok: true } | { ok: false; error: string }

/**
 * Whether a looked-up Person may be assigned a visual. Takes the result of the
 * lookup (null when the id matched nobody) so the route can show a clear 400.
 * Inactive people are hidden from pickers for new assignments, so the API
 * refuses them too.
 */
export function canBeAssigned(person: { isActive: boolean } | null | undefined): Assignable {
  if (!person) return { ok: false, error: "That person doesn't exist, so they can't be assigned" }
  if (!person.isActive) return { ok: false, error: "That person is inactive, so they can't be assigned new work" }
  return { ok: true }
}

// ─── Data link ────────────────────────────────────────────────────────────────

export const DATA_URL_MAX_LENGTH = 2048

export type ParsedDataUrl = { ok: true; value: string | null } | { ok: false; error: string }

/**
 * Validates the requester's "Link to data". A security check, not cosmetics:
 * "is it a URL" accepts `javascript:` links, which are unsafe as a clickable
 * href. Accepts only https with no embedded credentials; empty input becomes
 * `null`. `value` is the normalized href. Run it again before rendering.
 */
export function parseDataUrl(input: string | null | undefined): ParsedDataUrl {
  const trimmed = (input ?? "").trim()
  if (trimmed === "") return { ok: true, value: null }
  if (trimmed.length > DATA_URL_MAX_LENGTH) {
    return { ok: false, error: `Link must be ${DATA_URL_MAX_LENGTH} characters or fewer` }
  }
  // The scheme check is on the raw text: the URL parser forgives `https:host`
  // and `https:\\host`, which a person didn't mean as a link.
  if (!/^https:\/\//i.test(trimmed)) return { ok: false, error: "Link must start with https://" }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: "Link is not a valid URL" }
  }
  if (url.protocol !== "https:") return { ok: false, error: "Link must start with https://" }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "Link must not contain a username or password" }
  }
  return { ok: true, value: url.href }
}
