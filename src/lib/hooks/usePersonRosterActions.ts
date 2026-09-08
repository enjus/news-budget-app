import { useState } from "react"
import { toast } from "sonner"
import { apiPath } from "@/lib/api-path"

// Shared roster-toggle logic for a Person — previously implemented nearly
// verbatim in both PersonView.tsx and PersonForm.tsx (the same fetch + toast
// + loading-state shape, copy-pasted). Consolidated here so the two call
// sites can't drift the way they already had (PersonView's toast copy read
// "...staff roster" while PersonForm's read "...staff").
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
      throw new Error(json?.error ?? `Request failed (${res.status})`)
    }
  }

  async function toggleActive(currentIsActive: boolean) {
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

  async function toggleStaff(currentIsStaff: boolean) {
    setTogglingStaff(true)
    try {
      await patchPerson({ isStaff: !currentIsStaff })
      toast.success(currentIsStaff ? "Removed from staff" : "Added to staff")
      onChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTogglingStaff(false)
    }
  }

  return { togglingActive, togglingStaff, toggleActive, toggleStaff }
}
