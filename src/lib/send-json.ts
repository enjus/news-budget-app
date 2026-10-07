import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"

/**
 * Client-side admin mutation: sends `body` as JSON (or nothing, for DELETE)
 * through apiPath(). On a non-2xx response it toasts the server's `error`
 * string (or `failMessage`) and throws, so callers can bail out of their
 * success path without their own catch-and-toast.
 */
export async function sendJSON(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: object | null,
  failMessage: string
) {
  const res = await fetch(apiPath(url), {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    toast.error(typeof err.error === "string" ? err.error : failMessage)
    throw new Error(failMessage)
  }
}
