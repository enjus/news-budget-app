"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { PERSON_ROLE_LABELS } from "@/lib/utils"
import type { Person } from "@/types/index"

const ROLE_OPTIONS = [
  "REPORTER",
  "EDITOR",
  "PHOTOGRAPHER",
  "GRAPHIC_DESIGNER",
  "PUBLICATION_DESIGNER",
  "OTHER",
] as const

interface PersonFormProps {
  person?: Person
  onSuccess: () => void
  trigger: React.ReactNode
}

export function PersonForm({ person, onSuccess, trigger }: PersonFormProps) {
  const [open, setOpen] = useState(false)
  const isEdit = !!person

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
          email: person.email,
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
      const url = isEdit ? `/api/people/${person!.id}` : "/api/people"
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

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      reset(
        person
          ? {
              name: person.name,
              email: person.email,
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
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-email">Email</Label>
            <Input
              id="pf-email"
              type="email"
              {...register("email")}
              placeholder="email@example.com"
              aria-invalid={!!errors.email}
            />
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

          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
