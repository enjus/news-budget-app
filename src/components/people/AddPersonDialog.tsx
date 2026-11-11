"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createContributorSchema, createStaffSchema } from "@/lib/validations"
import { apiPath } from "@/lib/api-path"
import { PersonRoleSelect } from "./PersonRoleSelect"

type Kind = "staff" | "contributor"

interface FormValues {
  name: string
  email?: string
  defaultRole: string
}

interface AddPersonDialogProps {
  /** staff: admin-only, needs a work email. contributor: any content creator,
   *  no email — their contact details go on the roster profile. */
  kind: Kind
  trigger: React.ReactNode
  /** Called with the new Person's id. A contributor is then taken to their
   *  roster profile unless this returns false. */
  onCreated?: (id: string) => void | false
}

const COPY: Record<Kind, { title: string; description: string; submit: string }> = {
  staff: {
    title: "Add staff",
    description:
      "Staff receive @-mentions and notification emails at their work email, and appear on Schedule.",
    submit: "Add staff",
  },
  contributor: {
    title: "Add contributor",
    description:
      "A freelancer or other non-staff contributor. Contributors never receive notification emails. Add personal contact details and a map pin on their roster profile next.",
    submit: "Add contributor",
  },
}

export function AddPersonDialog({ kind, trigger, onCreated }: AddPersonDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const copy = COPY[kind]
  const empty: FormValues = { name: "", email: "", defaultRole: "OTHER" }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // The schema's `kind` is added at submit, so validate without it here.
    resolver: zodResolver(
      kind === "staff"
        ? createStaffSchema.omit({ kind: true })
        : createContributorSchema.omit({ kind: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any,
    defaultValues: empty,
  })

  async function onSubmit(data: FormValues) {
    try {
      const body = { kind, name: data.name, email: data.email, defaultRole: data.defaultRole }
      const res = await fetch(apiPath("/api/people"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)

      toast.success(kind === "staff" ? "Staff member added" : "Contributor added")
      setOpen(false)
      reset(empty)
      const proceed = onCreated?.(json.id)
      if (kind === "contributor" && proceed !== false) router.push(`/roster/${json.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) reset(empty)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              {...register("name")}
              placeholder="Full name"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            <p className="text-xs text-muted-foreground">
              Join a multipart surname with underscores (&ldquo;Alex Van_Der_Berg&rdquo;) so it
              stays together on budget cards.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-email">
              Work email
              {kind === "contributor" && (
                <span className="font-normal text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Input
              id="ap-email"
              type="email"
              {...register("email")}
              placeholder={kind === "staff" ? "name@oregonian.com" : "name@example.com"}
              aria-invalid={!!errors.email}
            />
            {kind === "contributor" && (
              <p className="text-xs text-muted-foreground">
                Their own professional address, shown on the roster.
              </p>
            )}
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-role">Default Role</Label>
            <Controller
              name="defaultRole"
              control={control}
              render={({ field }) => (
                <PersonRoleSelect
                  id="ap-role"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.defaultRole}
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
