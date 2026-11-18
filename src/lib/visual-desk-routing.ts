// Desk routing for visual request emails (issue #23, slices 2–3): which
// addresses each visual type's desk email goes to, and validation of the lists
// admins save at /admin/visual-requests. Pure and dependency-light on purpose
// (no mail or database imports), so the admin page can run validateEmailList()
// in the browser. Re-exported from visual-notifications.ts.
// Spec: docs/visual-requests-slice-3.md §14.

import { z } from "zod"

// ─── Desk recipients ──────────────────────────────────────────────────────────

/** Env var holding each type's desk list. Map has no desk of its own and reads the graphic list. */
export const DESK_EMAIL_ENV: Record<string, string> = {
  PHOTO: "VISUAL_REQUEST_EMAILS_PHOTO",
  GRAPHIC: "VISUAL_REQUEST_EMAILS_GRAPHIC",
  MAP: "VISUAL_REQUEST_EMAILS_GRAPHIC",
  VIDEO: "VISUAL_REQUEST_EMAILS_VIDEO",
}

/**
 * Split a comma-separated address list: trimmed, blanks dropped, duplicates
 * removed case-insensitively (first spelling wins). No syntax check beyond
 * that — the relay rejects a bad address and sendEmail() logs it.
 */
export function parseEmailList(raw: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim()
    const key = email.toLowerCase()
    if (!email || seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out
}

/** The four types with a desk list, in the order the admin page shows them. */
export const DESK_TYPES = ["PHOTO", "GRAPHIC", "MAP", "VIDEO"] as const
export type DeskType = (typeof DESK_TYPES)[number]

/** A VisualDeskRouting row, as far as resolution cares. */
export interface DeskRoutingRow {
  type: string
  emails: string
}

/**
 * Where a type's list came from: its own row on /admin/visual-requests, the
 * Graphic row (Map only), the server env var, or nowhere.
 */
export type DeskRecipientSource = "table" | "graphic table" | "env" | "none"

/**
 * Resolve a type's desk addresses (slice 3 §14). In order: the type's own row,
 * if it has any addresses; for MAP only, the GRAPHIC row; then the type's
 * VISUAL_REQUEST_EMAILS_* var (Map reads the graphic one). Pure: the caller
 * passes the table rows and the env (process.env in the app, plain objects in
 * tests). An unknown type resolves to nothing.
 */
export function resolveDeskRecipients(
  type: string,
  env: Record<string, string | undefined>,
  rows: readonly DeskRoutingRow[] = [],
): { emails: string[]; source: DeskRecipientSource } {
  const key = DESK_EMAIL_ENV[type]
  if (!key) return { emails: [], source: "none" }
  const rowList = (t: string) => parseEmailList(rows.find((r) => r.type === t)?.emails)

  const own = rowList(type)
  if (own.length > 0) return { emails: own, source: "table" }
  if (type === "MAP") {
    const graphic = rowList("GRAPHIC")
    if (graphic.length > 0) return { emails: graphic, source: "graphic table" }
  }
  const fromEnv = parseEmailList(env[key])
  return fromEnv.length > 0 ? { emails: fromEnv, source: "env" } : { emails: [], source: "none" }
}

/**
 * The desk addresses for a visual type (see resolveDeskRecipients). Empty when
 * nothing is configured — the caller logs and skips rather than failing.
 */
export function deskRecipients(
  type: string,
  env: Record<string, string | undefined>,
  rows: readonly DeskRoutingRow[] = [],
): string[] {
  return resolveDeskRecipients(type, env, rows).emails
}

/** Which step answered for a type — for the admin page's "server default" / "following Graphic" labels. */
export function deskRecipientSource(
  type: string,
  env: Record<string, string | undefined>,
  rows: readonly DeskRoutingRow[] = [],
): DeskRecipientSource {
  return resolveDeskRecipients(type, env, rows).source
}

/** Limits on one type's list in /admin/visual-requests. */
export const DESK_LIST_MAX_ADDRESSES = 20
export const DESK_LIST_MAX_LENGTH = 2000

export type ValidatedEmailList =
  | { ok: true; emails: string[] }
  | { ok: false; errors: { address: string | null; message: string }[] }

const emailCheck = z.email()

/**
 * Validate an admin-entered address list: parseEmailList() (trim, drop blanks,
 * dedupe), then each address on its own, so one typo names that address
 * instead of failing the whole field. Empty input is valid and empty (it means
 * "use the fallback"). Limit errors have a null `address`.
 */
export function validateEmailList(raw: string): ValidatedEmailList {
  if (raw.length > DESK_LIST_MAX_LENGTH) {
    return { ok: false, errors: [{ address: null, message: `Keep the list under ${DESK_LIST_MAX_LENGTH} characters` }] }
  }
  const emails = parseEmailList(raw)
  if (emails.length > DESK_LIST_MAX_ADDRESSES) {
    return { ok: false, errors: [{ address: null, message: `At most ${DESK_LIST_MAX_ADDRESSES} addresses per list` }] }
  }
  const errors = emails
    .filter((e) => !emailCheck.safeParse(e).success)
    .map((address) => ({ address, message: `${address} isn't a valid email address` }))
  return errors.length > 0 ? { ok: false, errors } : { ok: true, emails }
}
