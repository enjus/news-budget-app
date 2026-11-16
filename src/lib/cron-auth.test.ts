import { describe, it, expect } from "vitest"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

describe("isAuthorizedCronRequest", () => {
  it("accepts the exact Bearer token when a secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true)
  })

  it("rejects a wrong, malformed, or missing header", () => {
    expect(isAuthorizedCronRequest("Bearer nope", "s3cret")).toBe(false)
    expect(isAuthorizedCronRequest("s3cret", "s3cret")).toBe(false)
    expect(isAuthorizedCronRequest("bearer s3cret", "s3cret")).toBe(false)
    expect(isAuthorizedCronRequest(null, "s3cret")).toBe(false)
    expect(isAuthorizedCronRequest(undefined, "s3cret")).toBe(false)
  })

  it("fails closed when the secret is unset or empty, even for the matching template string", () => {
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false)
    expect(isAuthorizedCronRequest("Bearer null", null)).toBe(false)
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false)
    expect(isAuthorizedCronRequest("Bearer", "")).toBe(false)
    expect(isAuthorizedCronRequest(null, undefined)).toBe(false)
  })
})
