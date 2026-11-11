import { useState } from "react"
import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"

// Shared staff/active toggle logic for a Person (PATCH /api/people/[id]),
// kept in one hook so the confirm copy and toasts can't drift between call
// sites the way they once did.
export function usePersonRosterActions(personId: string, onChanged: () => void) {
  const [togglingActive, setTogglingActive] = useState(false)
  const [togglingStaff, setTogglingStaff] = useState(false)

  async function patchPerson(body: Record<string, unknown>) {
    const res = await fetch(apiPath(`/api/people/${personId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      const fieldError = json?.fieldErrors && Object.values(json.fieldErrors).flat()[0]
      throw new Error((fieldError as string) ?? json?.error ?? `Request failed (${res.status})`)
    }
  }

  async function toggleActive(currentIsActive: boolean, isStaff: boolean) {
    // Deactivating a staffer also deletes their roster contact details
    // (PATCH /api/people/[id]) — irreversible, so confirm first. A
    // contributor's contact details are kept.
    if (
      currentIsActive &&
      !confirm(
        isStaff
          ? "Mark this person inactive? Their personal phone, personal email, and home address on the roster will be permanently deleted."
          : "Mark this contributor inactive? They'll be hidden from pickers. Their contact info stays on the roster."
      )
    ) {
      return
    }
    setTogglingActive(true)
    try {
      await patchPerson({ isActive: !currentIsActive })
      toast.success(currentIsActive ? "Marked inactive" : "Marked active")
      onChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTogglingActive(false)
    }
  }

  /** Remove from staff after a confirm. Clears the work email and work week server-side. */
  async function removeFromStaff(): Promise<boolean> {
    if (
      !confirm(
        "Remove from staff? This clears their company work email, their regular work week and their upcoming shifts (from tomorrow on; earlier shifts stay as history), and they'll stop receiving notification emails. You can add their own work email afterward.\n\n" +
          "Their personal contact info stays on the roster, editors can now edit it, and it's kept if they're later marked inactive. " +
          "If they've left the newsroom, mark them inactive first instead."
      )
    ) {
      return false
    }
    return setStaff({ isStaff: false }, "Removed from staff")
  }

  /** Add to staff with their work email (the notification address). */
  async function addToStaff(email: string): Promise<boolean> {
    return setStaff({ isStaff: true, email }, "Added to staff")
  }

  async function setStaff(body: Record<string, unknown>, success: string): Promise<boolean> {
    setTogglingStaff(true)
    try {
      await patchPerson(body)
      toast.success(success)
      onChanged()
      return true
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
      return false
    } finally {
      setTogglingStaff(false)
    }
  }

  return { togglingActive, togglingStaff, toggleActive, removeFromStaff, addToStaff }
}
