import { NextRequest, NextResponse } from "next/server"
import { writeLimiter, WRITE_LIMIT, readLimiter, READ_LIMIT } from "./rate-limit"

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
