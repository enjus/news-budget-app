/**
 * Simple in-memory rate limiter using a sliding-window token bucket.
 *
 * Each Vercel function instance maintains its own bucket map, so this provides
 * per-instance throttling — sufficient for ~100 users. For adversarial traffic
 * at scale, replace with Upstash @upstash/ratelimit (Redis-backed).
 */

interface Bucket {
  count: number
  resetTime: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
}

export function createRateLimiter(opts: {
  /** Window duration in milliseconds */
  interval: number
  /** Max distinct tokens to track (prevents unbounded memory) */
  maxTokens?: number
}) {
  const buckets = new Map<string, Bucket>()
  const maxTokens = opts.maxTokens ?? 500

  return {
    /**
     * Check whether the given token (e.g. user ID or IP) is within its rate limit.
     * @param limit - Max requests allowed per window
     * @param token - Unique identifier for the requester
     */
    check(limit: number, token: string): RateLimitResult {
      const now = Date.now()
      const bucket = buckets.get(token)

      if (!bucket || now > bucket.resetTime) {
        // Prune expired entries if the map is getting large
        if (buckets.size > maxTokens) {
          for (const [k, v] of buckets) {
            if (now > v.resetTime) buckets.delete(k)
          }
        }
        buckets.set(token, { count: 1, resetTime: now + opts.interval })
        return { success: true, remaining: limit - 1 }
      }

      if (bucket.count >= limit) {
        return { success: false, remaining: 0 }
      }

      bucket.count++
      return { success: true, remaining: limit - bucket.count }
    },
  }
}

// Shared limiter instances — one for writes, one for reads
// These persist for the lifetime of the serverless function instance.

/** 30 mutation requests per 60 seconds per user */
export const writeLimiter = createRateLimiter({ interval: 60_000 })
export const WRITE_LIMIT = 30

/** 120 read requests per 60 seconds per user */
export const readLimiter = createRateLimiter({ interval: 60_000 })
export const READ_LIMIT = 120
