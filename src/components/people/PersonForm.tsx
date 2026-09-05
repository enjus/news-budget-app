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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createPersonSchema,
  type CreatePersonInput,
} from "@/lib/validations"
import { PERSON_ROLE_LABELS, hasAdminAccess, canManageRoster, displayName } from "@/lib/utils"
import type { PersonWithCounts } from "@/types/index"
import { apiPath } from "@/lib/api-path"
import { WorkScheduleEditor } from "./WorkScheduleEditor"

const ROLE_OPTIONS = [
  "REPORTER",
  "EDITOR",
  "PHOTOGRAPHER",
  "VIDEOGRAPHER",
  "GRAPHIC_DESIGNER",
  "PUBLICATION_DESIGNER",
  "OTHER",
] as const

interface PersonFormProps {
  person?: PersonWithCounts
  onSuccess: () => void
  trigger: React.ReactNode
}

export function PersonForm({ person, onSuccess, trigger }: PersonFormProps) {
  const { data: session } = useSession()
  const isAdmin = hasAdminAccess(session?.user?.appRole ?? "")
  const canManage = canManageRoster(session?.user?.appRole ?? "")
  const [open, setOpen] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [togglingStaff, setTogglingStaff] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isEdit = !!person
  const assignmentCount = person
    ? (person._count?.assignments ?? 0) + (person._count?.videoAssignments ?? 0)
    : 0

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePersonInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createPersonSchema) as any,
    defaultValues: person
      ? {
          name: person.name,
          email: person.email ?? "",
          defaultRole: person.defaultRole as CreatePersonInput["defaultRole"],
        }
      : {
          name: "",
          email: "",
          defaultRole: "OTHER",
        },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    try {
      const url = apiPath(isEdit ? `/api/people/${person!.id}` : "/api/people")
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }

      toast.success(isEdit ? "Person updated" : "Person created")
      setOpen(false)
      reset()
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  async function handleToggleActive() {
    if (!person) return
    setTogglingActive(true)
    try {
      const res = await fetch(apiPath(`/api/people/${person.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !person.isActive }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success(person.isActive ? "Marked inactive" : "Marked active")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTogglingActive(false)
    }
  }

  async function handleToggleStaff() {
    if (!person) return
    setTogglingStaff(true)
    try {
      const res = await fetch(apiPath(`/api/people/${person.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStaff: !person.isStaff }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success(person.isStaff ? "Removed from staff" : "Added to staff")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTogglingStaff(false)
    }
  }

  async function handleDelete() {
    if (!person) return
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

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      reset(
        person
          ? {
              name: person.name,
              email: person.email ?? "",
              defaultRole: person.defaultRole as CreatePersonInput["defaultRole"],
            }
          : { name: "", email: "", defaultRole: "OTHER" }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Person" : "New Person"}</DialogTitle>
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

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-email">
              Email <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="pf-email"
              type="email"
              {...register("email")}
              placeholder="email@example.com"
              aria-invalid={!!errors.email}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for freelancers or others without an account — they won&apos;t receive
              @-mentions or notification emails.
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
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="pf-role" aria-invalid={!!errors.defaultRole}>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {PERSON_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.defaultRole && (
              <p className="text-xs text-destructive">{errors.defaultRole.message}</p>
            )}
          </div>

          {/* Roster status — rarely-touched toggles, so they live here
              rather than as always-visible row icons. Each fires its own
              PATCH immediately (like WorkScheduleEditor below) instead of
              folding into this form's submit, since they're gated by a
              different permission (canManageRoster/hasAdminAccess) than the
              name/email/role fields anyone with write access can edit. */}
          {isEdit && (canManage || isAdmin) && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={togglingStaff}
                  onClick={handleToggleStaff}
                >
                  <Briefcase className="size-4" />
                  {person!.isStaff ? "Remove from staff" : "Add to staff"}
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={togglingActive}
                  onClick={handleToggleActive}
                >
                  {person!.isActive ? (
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
          )}

          {/* Regular work week — only for an existing staff member, and only
              a roster manager can set it (canManageRoster gates the write at
              the API layer too). Saves independently via its own button;
              unrelated to this form's own submit. */}
          {isEdit && person!.isStaff && canManage && (
            <WorkScheduleEditor personId={person!.id} />
          )}

          <DialogFooter className="sm:justify-between">
            {isEdit &&
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
                      <AlertDialogTitle>Delete {displayName(person!.name)}?</AlertDialogTitle>
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
                {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Person"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
