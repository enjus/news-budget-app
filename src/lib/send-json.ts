import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"

/**
 * Client-side admin mutation: sends `body` as JSON (or nothing, for DELETE)
 * through apiPath(). On a non-2xx response it toasts the server's `error`
 * string (or `failMessage`); on a network failure it toasts that. Either way
 * it throws, so callers can bail out of their success path without their
 * own catch-and-toast.
 */
export async function sendJSON(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: object | null,
  failMessage: string
) {
  let res: Response
  try {
    res = await fetch(apiPath(url), {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    })
  } catch {
    // fetch() itself rejects when the request never reaches the server
    // (offline, DNS, dropped connection) — without this, nothing is toasted.
    toast.error("Couldn't reach the server. Check your connection and try again.")
    throw new Error(failMessage)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    toast.error(typeof err.error === "string" ? err.error : failMessage)
    throw new Error(failMessage)
  }
}
