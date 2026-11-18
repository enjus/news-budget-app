// Visual requests (issue #23, slice 1): permissions, assignment and the data-link
// check for Visual rows. Pure functions only — see docs/visual-requests-slice-1.md.
// The status sets and transition table are in ./visual-statuses (re-exported here).
import { canCreateContent, hasAdminAccess, hasElevatedAccess } from "./utils"
import { canTransition, isAttachableStatus, isTerminalStatus } from "./visual-statuses"

export * from "./visual-statuses"

// ─── Permissions ──────────────────────────────────────────────────────────────

export type VisualAction =
  | "update"   // edit details (type, description, notes, dataUrl, …)
  | "assign"   // set or change personId (pass the target: non-elevated users may only claim for themselves)
  | "advance"  // → IN_PROGRESS, → DELIVERED
  | "decline"
  | "cancel"
  | "delete"
  | "attach"   // set or change storyId (attach a request to a story, or move it)
  | "release"  // ASSIGNED → REQUESTED: the assignee hands it back to the queue

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
 * REQUESTED and later follow the issue's permissions table, plus self-claim
 * (Ryan, Nov 17). Doesn't check whether the *transition* is legal — pair with
 * canTransition().
 *
 * `targetPersonId` is who an "assign" would assign, and is ignored otherwise.
 * Elevated roles may assign anyone. Anyone else may only *claim*: assign an
 * unassigned REQUESTED request to themselves. So a non-elevated assignee can't
 * hand a request to a colleague; they release it instead.
 */
export function canActOnVisual(
  actor: VisualActor,
  visual: VisualPermissionTarget,
  action: VisualAction,
  targetPersonId?: string | null,
): boolean {
  if (!canCreateContent(actor.role)) return false

  if (visual.status === "PLANNED") {
    return action === "update" || action === "assign" || action === "delete"
  }

  const isAssignee = actor.personId !== null && visual.personId === actor.personId
  const isRequester = actor.personId !== null && visual.requestedById === actor.personId

  switch (action) {
    case "update":
      // A finished request's details are the record of what was asked: locked
      // once DELIVERED, DECLINED or CANCELED. Attaching is a separate action
      // and still works on a DELIVERED request.
      return !isTerminalStatus(visual.status) && (isRequester || hasElevatedAccess(actor.role))
    case "assign":
      if (hasElevatedAccess(actor.role)) return true
      return (
        actor.personId !== null &&
        targetPersonId === actor.personId &&
        visual.status === "REQUESTED" &&
        visual.personId === null
      )
    case "release":
      // The assignee only, and only before work starts. A desk editor who isn't
      // the assignee reassigns instead.
      return isAssignee && visual.status === "ASSIGNED"
    case "advance":
      return isAssignee || hasElevatedAccess(actor.role)
    case "decline":
      return hasElevatedAccess(actor.role)
    case "cancel":
      return isRequester || hasAdminAccess(actor.role)
    case "delete":
      return hasAdminAccess(actor.role) && isTerminalStatus(visual.status)
    case "attach":
      // The assignee is included: the photographer often knows where the work ended up.
      return isAttachableStatus(visual.status) && (isRequester || isAssignee || hasElevatedAccess(actor.role))
  }
}

/** Whether the actor can assign this request to themselves: unassigned, REQUESTED, and a linked Person. */
export function canClaimVisual(actor: VisualActor, visual: VisualPermissionTarget): boolean {
  return (
    actor.personId !== null &&
    visual.status === "REQUESTED" &&
    visual.personId === null &&
    canActOnVisual(actor, visual, "assign", actor.personId)
  )
}

/**
 * The `where` for the PATCH route's guarded write: the row must still have the
 * status, assignee and story the route validated against. Two people claiming
 * the same request both validate against (REQUESTED, no assignee); the first
 * write changes both, so the second matches nothing and gets a 409. Same for
 * racing transitions, reassignments and attaches.
 */
export function visualPatchGuard(existing: { id: string; status: string; personId: string | null; storyId: string | null }) {
  return { id: existing.id, status: existing.status, personId: existing.personId, storyId: existing.storyId }
}

/** The action buttons a request's page can show, in display order. */
export type VisualButton =
  | "assign"   // Assign (REQUESTED) or Reassign (ASSIGNED): the person picker, elevated only
  | "claim"    // assign an unassigned REQUESTED request to yourself
  | "start"    // ASSIGNED → IN_PROGRESS
  | "deliver"  // IN_PROGRESS → DELIVERED
  | "release"  // ASSIGNED → REQUESTED, by the assignee
  | "decline"
  | "cancel"
  | "edit"
  | "attach"   // Attach to story, or Move to another story when it has one
  | "delete"

/**
 * Which buttons to show this actor on a request: each is canActOnVisual() and,
 * for a status change, canTransition(), so the UI offers exactly what the
 * PATCH/DELETE routes would accept. PLANNED rows are credits with no request
 * page, so they get nothing here. The server still checks every action itself.
 */
export function availableVisualActions(actor: VisualActor, visual: VisualPermissionTarget): VisualButton[] {
  if (visual.status === "PLANNED") return []
  const can = (action: VisualAction) => canActOnVisual(actor, visual, action)
  const buttons: VisualButton[] = []
  // With no target, "assign" is only true for elevated roles: the picker can name anyone.
  if (can("assign") && (visual.status === "REQUESTED" || visual.status === "ASSIGNED")) buttons.push("assign")
  if (canClaimVisual(actor, visual)) buttons.push("claim")
  if (can("advance") && canTransition(visual.status, "IN_PROGRESS")) buttons.push("start")
  if (can("advance") && canTransition(visual.status, "DELIVERED")) buttons.push("deliver")
  if (can("release") && canTransition(visual.status, "REQUESTED")) buttons.push("release")
  if (can("decline") && canTransition(visual.status, "DECLINED")) buttons.push("decline")
  if (can("cancel") && canTransition(visual.status, "CANCELED")) buttons.push("cancel")
  if (can("update")) buttons.push("edit")
  if (can("attach")) buttons.push("attach")
  if (can("delete")) buttons.push("delete")
  return buttons
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

// ─── Filing a request ─────────────────────────────────────────────────────────

/** A parsed request body (requestVisualSchema's output). Spelled out so this module needn't import validations.ts. */
export interface VisualRequestInput {
  type: string
  description: string
  priority: string
  eventDateTime?: string | null
  location?: string | null
  deadline?: string | null
  notes?: string | null
  dataUrl?: string | null
}

/**
 * The `data` for creating a REQUESTED visual, shared by the story route and the
 * standalone POST /api/visuals so the two can't drift. `storyId` is null for a
 * standalone request. No assignee: one is chosen later. `requestedById` comes
 * from the session, never the body. eventDateTime/deadline are newsroom time
 * encoded as UTC and pass through `new Date()` unchanged.
 */
export function visualRequestCreateData(input: VisualRequestInput, requestedById: string, storyId: string | null) {
  return {
    storyId,
    status: "REQUESTED" as const,
    requestedById,
    type: input.type,
    description: input.description,
    priority: input.priority,
    eventDateTime: input.eventDateTime ? new Date(input.eventDateTime) : null,
    location: input.location ?? null,
    deadline: input.deadline ? new Date(input.deadline) : null,
    notes: input.notes ?? null,
    dataUrl: input.dataUrl ?? null,
  }
}
