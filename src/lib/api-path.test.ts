import { describe, it, expect } from "vitest"
import { signInRedirectPath } from "./api-path"

// Runs with no NEXT_PUBLIC_BASE_PATH, so app paths are unprefixed.
describe("signInRedirectPath", () => {
  it("returns the middleware's callback path", () => {
    expect(signInRedirectPath("/stories/abc")).toBe("/stories/abc")
    expect(signInRedirectPath("/budget/daily/2026-10-17?x=1")).toBe("/budget/daily/2026-10-17?x=1")
  })

  it("falls back to the homepage when missing", () => {
    expect(signInRedirectPath(undefined)).toBe("/")
    expect(signInRedirectPath("")).toBe("/")
  })

  it("rejects anything outside the app", () => {
    for (const url of ["https://evil.example/x", "//evil.example/x", "/\\evil.example/x", "javascript:alert(1)"]) {
      expect(signInRedirectPath(url)).toBe("/")
    }
  })

  it("doesn't send the user back to /login", () => {
    expect(signInRedirectPath("/login")).toBe("/")
    expect(signInRedirectPath("/login?callbackUrl=%2F")).toBe("/")
  })
})
