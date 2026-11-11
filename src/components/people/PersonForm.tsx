"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Briefcase, Trash2, UserCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updatePersonSchema, type UpdatePersonInput } from "@/lib/validations"
import { hasAdminAccess, canManageRoster, displayName } from "@/lib/utils"
import type { PersonWithCounts } from "@/types/index"
import { apiPath } from "@/lib/api-path"
import { usePersonRosterActions } from "@/lib/hooks/usePersonRosterActions"
import { PersonRoleSelect } from "./PersonRoleSelect"
import { WorkScheduleEditor } from "./WorkScheduleEditor"

interface PersonFormProps {
  person: PersonWithCounts
  onSuccess: () => void
  trigger: React.ReactNode
}

type FormValues = Pick<UpdatePersonInput, "name" | "email" | "defaultRole">

function defaults(person: PersonWithCounts): FormValues {
  return {
    name: person.name,
    email: person.email ?? "",
    defaultRole: person.defaultRole as FormValues["defaultRole"],
  }
}

/** Edit an existing Person. New people are created with AddPersonDialog. */
export function PersonForm({ person, onSuccess, trigger }: PersonFormProps) {
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const isAdmin = hasAdminAccess(appRole)
  const canManage = canManageRoster(appRole)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // "Add to staff" asks for the work email inline before it saves.
  const [staffEmail, setStaffEmail] = useState<string | null>(null)
  const assignmentCount = person._count.assignments + person._count.videoAssignments
  const { togglingActive, togglingStaff, toggleActive, removeFromStaff, addToStaff } =
    usePersonRosterActions(person.id, onSuccess)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updatePersonSchema) as any,
    defaultValues: defaults(person),
  })

  async function onSubmit(data: FormValues) {
    try {
      const body = { name: data.name, email: data.email, defaultRole: data.defaultRole }
      const res = await fetch(apiPath(`/api/people/${person.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }

      toast.success("Person updated")
      setOpen(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(apiPath(`/api/people/${person.id}`), { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Delete failed (${res.status})`)
      }
      toast.success(`${displayName(person.name)} deleted`)
      setOpen(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete person")
    } finally {
      setDeleting(false)
    }
  }

  async function handleRemoveFromStaff() {
    if (await removeFromStaff()) setOpen(false)
  }

  async function handleAddToStaff() {
    const email = staffEmail?.trim() ?? ""
    if (!email) {
      toast.error("Enter their work email")
      return
    }
    if (await addToStaff(email)) {
      setStaffEmail(null)
      setOpen(false)
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      reset(defaults(person))
      setStaffEmail(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person.isStaff ? "Edit staff member" : "Edit contributor"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">Name</Label>
            <Input
              id="pf-name"
              {...register("name")}
              placeholder="Full name"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              For a multipart surname (e.g. &ldquo;Van Der Berg&rdquo;), join it
              with underscores &mdash; &ldquo;Alex Van_Der_Berg&rdquo; &mdash; so it
              stays together on budget cards. It still displays with spaces
              everywhere.
            </p>
          </div>

          {/* Work email — shown on the roster beside the work phone. Only a
              staffer's (company) address is notified; see notifiableEmail(). */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-email">
              Work email
              {!person.isStaff && (
                <span className="font-normal text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Input
              id="pf-email"
              type="email"
              {...register("email")}
              placeholder={person.isStaff ? "name@oregonian.com" : "name@example.com"}
              aria-invalid={!!errors.email}
            />
            <p className="text-xs text-muted-foreground">
              {person.isStaff
                ? "Their company address. @-mentions and notification emails go here."
                : "Their own professional address, shown on the roster. Contributors never receive notification emails."}
            </p>
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Default Role */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-role">Default Role</Label>
            <Controller
              name="defaultRole"
              control={control}
              render={({ field }) => (
                <PersonRoleSelect
                  id="pf-role"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.defaultRole}
                />
              )}
            />
            {errors.defaultRole && (
              <p className="text-xs text-destructive">{errors.defaultRole.message}</p>
            )}
          </div>

          {/* Staff/active status — each fires its own PATCH immediately (like
              WorkScheduleEditor below) instead of folding into this form's
              submit, since they're gated by canManageRoster/hasAdminAccess
              rather than the content-creator floor of the fields above. */}
          {(canManage || isAdmin) && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap gap-2">
                {canManage && person.isStaff && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={togglingStaff}
                    onClick={handleRemoveFromStaff}
                  >
                    <Briefcase className="size-4" />
                    Remove from staff
                  </Button>
                )}
                {canManage && !person.isStaff && staffEmail === null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStaffEmail("")}
                  >
                    <Briefcase className="size-4" />
                    Add to staff
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={togglingActive}
                    onClick={() => toggleActive(person.isActive, person.isStaff)}
                  >
                    {person.isActive ? (
                      <>
                        <UserX className="size-4" />
                        Mark inactive
                      </>
                    ) : (
                      <>
                        <UserCheck className="size-4" />
                        Mark active
                      </>
                    )}
                  </Button>
                )}
              </div>

              {staffEmail !== null && (
                <div className="space-y-1.5 rounded-md border p-3">
                  <Label htmlFor="pf-staff-email">Work email</Label>
                  <Input
                    id="pf-staff-email"
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder="name@oregonian.com"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Their company address. Staff receive @-mentions and notification emails here.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={togglingStaff}
                      onClick={handleAddToStaff}
                    >
                      Add to staff
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setStaffEmail(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Regular work week — staff only, set by a roster manager
              (canManageRoster gates the write at the API layer too). Saves
              independently via its own button. */}
          {person.isStaff && canManage && <WorkScheduleEditor personId={person.id} />}

          <DialogFooter className="sm:justify-between">
            {canManage &&
              (assignmentCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  title={`Cannot delete: has ${assignmentCount} assignment${assignmentCount !== 1 ? "s" : ""}`}
                  className="cursor-not-allowed text-destructive opacity-40 sm:mr-auto"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleting}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {displayName(person.name)}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this person.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={handleDelete}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ))}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
