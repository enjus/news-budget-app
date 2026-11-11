import { describe, it, expect } from "vitest"
import { planPersonPatch } from "@/lib/person-patch"

const staffer = { isStaff: true, email: "a@oregonian.com" }
const staffNoEmail = { isStaff: true, email: null }
const contributor = { isStaff: false, email: "c@freelance.example" }

describe("planPersonPatch", () => {
  it("clears the company email when someone actually leaves staff", () => {
    const plan = planPersonPatch(staffer, { isStaff: false })
    expect(plan).toMatchObject({ ok: true, leavingStaff: true, data: { isStaff: false, email: null } })
  })

  it("keeps a replacement email sent with the staff removal", () => {
    expect(planPersonPatch(staffer, { isStaff: false, email: "own@example.com" })).toMatchObject({
      ok: true,
      data: { email: "own@example.com" },
    })
  })

  it("doesn't wipe a contributor's email on a repeated isStaff: false", () => {
    const plan = planPersonPatch(contributor, { isStaff: false })
    expect(plan).toMatchObject({ ok: true, leavingStaff: false })
    expect(plan.ok && plan.data.email).toBeUndefined()
  })

  it("requires a work email to join staff or when changing a staffer's email", () => {
    expect(planPersonPatch({ isStaff: false, email: null }, { isStaff: true })).toMatchObject({ ok: false, status: 400 })
    expect(planPersonPatch(staffer, { email: null })).toMatchObject({ ok: false, status: 400 })
    expect(planPersonPatch({ isStaff: false, email: null }, { isStaff: true, email: "n@o.com" })).toMatchObject({ ok: true })
  })

  it("lets an older staff record with no email be renamed or deactivated", () => {
    expect(planPersonPatch(staffNoEmail, { name: "Renamed", email: null })).toMatchObject({ ok: true })
    expect(planPersonPatch(staffNoEmail, { isActive: false })).toMatchObject({ ok: true, deletePrivate: true })
  })

  it("deletes a departing staffer's private details even when unstaffed in the same request", () => {
    expect(planPersonPatch(staffer, { isStaff: false, isActive: false })).toMatchObject({
      ok: true,
      deletePrivate: true,
      leavingStaff: true,
    })
  })

  it("keeps a contributor's private details on deactivation", () => {
    expect(planPersonPatch(contributor, { isActive: false })).toMatchObject({ ok: true, deletePrivate: false })
  })
})
