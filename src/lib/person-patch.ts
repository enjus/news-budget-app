import type { UpdatePersonInput } from "@/lib/validations"

// The staff/contributor rules for PATCH /api/people/[id], as a pure function
// so they can be unit-tested (person-patch.test.ts). The route reads the
// person's state *before* the write (inside its transaction, row locked),
// calls planPersonPatch(), and then applies the plan.
//
// Every decision uses the pre-write state: reading it back after the update
// would let a combined { isStaff: false, isActive: false } skip the
// staff-only cleanup.

export interface PersonBeforePatch {
  isStaff: boolean
  email: string | null
}

export type PersonPatchPlan =
  | {
      ok: true
      /** What to write to Person. */
      data: UpdatePersonInput
      /** Delete PersonPrivate: a staffer (before or after this write) being
       *  deactivated. A contributor's contact details are kept. */
      deletePrivate: boolean
      /** An actual staff → contributor change: delete their WorkSchedule and
       *  upcoming shifts (only staff have either). */
      leavingStaff: boolean
    }
  | {
      ok: false
      status: 400 | 403
      error: string
      fieldErrors?: Record<string, string[]>
    }

export function planPersonPatch(
  current: PersonBeforePatch,
  input: UpdatePersonInput,
  isAdmin: boolean
): PersonPatchPlan {
  // Staff/active status are admin-only.
  if (input.isActive !== undefined && !isAdmin) {
    return { ok: false, status: 403, error: "Only admins can change active status" }
  }
  if (input.isStaff !== undefined && !isAdmin) {
    return { ok: false, status: 403, error: "Only admins can change staff status" }
  }

  // A staffer's name, work email (the notification address) and default role
  // are admin-managed (/admin/people), matching PATCH /api/roster/[id].
  // Contributors' stay editable by any content creator.
  if (
    current.isStaff &&
    !isAdmin &&
    (input.name !== undefined || input.email !== undefined || input.defaultRole !== undefined)
  ) {
    return {
      ok: false,
      status: 403,
      error: "A staff member's name, work email and default role are managed by admins",
    }
  }

  // A staffer's work email is their company address, which a contributor
  // never has. So leaving staff clears it unless the same request supplies a
  // replacement (their own professional address). Only on an actual
  // staff → contributor change: repeating isStaff: false must not wipe a
  // contributor's own work email.
  const data: UpdatePersonInput = { ...input }
  const leavingStaff = current.isStaff && input.isStaff === false
  const joiningStaff = !current.isStaff && input.isStaff === true
  if (leavingStaff && data.email === undefined) data.email = null

  // Staff must keep a work email — it's where their notifications go.
  // Checked only when this request changes the email or adds to staff, so an
  // older staff record with no email can still be deactivated or renamed
  // (PersonForm re-sends the unchanged blank email on save).
  const staffAfter = data.isStaff ?? current.isStaff
  const emailAfter = data.email !== undefined ? data.email : current.email
  const emailChanged = data.email !== undefined && data.email !== current.email
  if ((emailChanged || joiningStaff) && staffAfter && !emailAfter) {
    return {
      ok: false,
      status: 400,
      error: "Staff need a work email",
      fieldErrors: { email: ["Staff need a work email"] },
    }
  }

  return {
    ok: true,
    data,
    deletePrivate: data.isActive === false && (current.isStaff || staffAfter),
    leavingStaff,
  }
}
