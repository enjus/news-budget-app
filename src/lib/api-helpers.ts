import { NextRequest, NextResponse } from "next/server"
import { writeLimiter, WRITE_LIMIT, readLimiter, READ_LIMIT } from "./rate-limit"
import { hasAdminAccess } from "./utils"

/**
 * Off-budget draft privacy check, shared by every route that touches a
 * Story/Video or one of its child resources (comments, visuals,
 * assignments, tags). Per CLAUDE.md this is deliberately per-route rather
 * than centralized middleware — callers still 404 on a missing parent
 * themselves; this only covers the onBudget/createdByUserId/assignments gate
 * itself, so the same rule can't drift between routes the way it previously
 * did.
 *
 * A draft is visible (and, per this same check, writable) to its creator,
 * anyone assigned to it, and admins. `parent.assignments` must be selected
 * by the caller — pass the StoryAssignment/VideoAssignment rows' `personId`s.
 * Visual credits are deliberately NOT consulted here (unlike
 * `collectEmails()`'s notification recipients) — the simplest rule for draft
 * access is assignment-based only.
 */
export function blockedFromDraft(
  parent: { onBudget: boolean; createdByUserId: string | null; assignments: { personId: string }[] },
  sessionUser: { id: string; appRole: string; personId?: string | null } | null | undefined
): boolean {
  if (parent.onBudget) return false
  if (!sessionUser) return true
  if (sessionUser.id === parent.createdByUserId) return false
  if (hasAdminAccess(sessionUser.appRole)) return false
  if (sessionUser.personId && parent.assignments.some((a) => a.personId === sessionUser.personId)) return false
  return true
}

/**
 * Apply rate limiting for a mutation (POST/PATCH/DELETE).
 * Returns a 429 Response if the limit is exceeded, or null if the request is allowed.
 */
export function checkWriteLimit(userId: string): NextResponse | null {
  const { success, remaining } = writeLimiter.check(WRITE_LIMIT, userId)
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } }
    )
  }
  return null
}

/**
 * Apply rate limiting for a read (GET).
 * Returns a 429 Response if the limit is exceeded, or null if the request is allowed.
 */
/**
 * Verify the request has a JSON content-type header.
 * Returns a 415 Response if invalid, or null if acceptable.
 */
export function requireJSON(request: NextRequest): NextResponse | null {
  const ct = request.headers.get("content-type") ?? ""
  if (!ct.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    )
  }
  return null
}

/**
 * Message for a P2002 (unique constraint) error on User.
 * Both `email` and `personId` are unique, so the violated target decides the
 * wording. Prisma reports `meta.target` as a string[] of field names or a
 * constraint name, depending on the driver — handle both.
 */
export function userUniqueConstraintMessage(error: unknown): string {
  const meta = (error as { meta?: { target?: string[] | string } }).meta
  const target = Array.isArray(meta?.target)
    ? meta.target.join(",")
    : String(meta?.target ?? "")
  return target.includes("personId")
    ? "That person is already linked to another user account"
    : "A user with that email already exists"
}

/**
 * Extract a Prisma error code (e.g. "P2025" not found, "P2002" unique
 * constraint) from a caught `unknown` error, or undefined if it isn't one.
 * Route handlers catch as `unknown` (not `any`) and use this to branch on
 * known Prisma failure modes without losing type safety on other errors.
 */
export function prismaErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

export function checkReadLimit(userId: string): NextResponse | null {
  const { success, remaining } = readLimiter.check(READ_LIMIT, userId)
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } }
    )
  }
  return null
}
