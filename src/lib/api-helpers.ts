import { NextRequest, NextResponse } from "next/server"
import { writeLimiter, WRITE_LIMIT, readLimiter, READ_LIMIT } from "./rate-limit"

// Off-budget draft privacy (view + write ownership gate) was deliberately
// removed — see CLAUDE.md's "Off-budget draft visibility" design decision.
// Drafts are now visible/writable the same way all other content is
// (canCreateContent(role) only); exposure is limited by navigability, not
// an access check.

/**
 * Shared optimistic-locking conflict check, used by every route that accepts
 * an optional client `version` on a Story/Video update (PATCH and the
 * publish routes). Callers only reach this once `clientVersion !== undefined`
 * — pass the Prisma model delegate (e.g. `prisma.story`), the record id, the
 * client's version, the update `data`, and a lowercase noun ("story"/"video")
 * for the error copy. Returns a 409/404 NextResponse to return immediately on
 * conflict, or `null` when the update succeeded — the caller still does its
 * own follow-up fetch (with its own `include`) to return the full record.
 */
export async function checkVersionConflict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: { updateMany: (args: any) => Promise<{ count: number }>; findUnique: (args: any) => Promise<{ id: string; version: number } | null> },
  id: string,
  clientVersion: number,
  data: Record<string, unknown>,
  noun: string
): Promise<NextResponse | null> {
  const updated = await delegate.updateMany({ where: { id, version: clientVersion }, data })
  if (updated.count > 0) return null
  const exists = await delegate.findUnique({ where: { id }, select: { id: true, version: true } })
  if (!exists) {
    return NextResponse.json({ error: `${noun[0].toUpperCase()}${noun.slice(1)} not found` }, { status: 404 })
  }
  return NextResponse.json(
    { error: `This ${noun} was modified by another user. Please reload.`, version: exists.version },
    { status: 409 }
  )
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
