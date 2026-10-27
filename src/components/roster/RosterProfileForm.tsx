"use client"

import { useState } from "react"
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
import { updateRosterProfileSchema, type UpdateRosterProfileInput } from "@/lib/validations"
import { formatPhone } from "@/lib/roster"
import { ROSTER_LANGUAGE_CODES, type RosterLanguageCode } from "@/lib/languages"
import { displayName } from "@/lib/utils"
import { apiPath } from "@/lib/api-path"
import type { RosterProfile } from "@/types/index"
import { LanguagePicker } from "./LanguagePicker"

// Form values are the raw inputs (strings); the schema's transforms normalize
// handles/phone on submit, and the API re-validates with the same schema.
function toFormValues(p: RosterProfile): UpdateRosterProfileInput {
  return {
    title: p.title ?? "",
    workPhone: p.workPhone ? formatPhone(p.workPhone) : "",
    pronouns: p.pronouns ?? "",
    xHandle: p.xHandle ?? "",
    blueskyHandle: p.blueskyHandle ?? "",
    linkedinSlug: p.linkedinSlug ?? "",
    instagramHandle: p.instagramHandle ?? "",
    // Drop any code since removed from ROSTER_LANGUAGES, or saving would 400.
    languages: p.languages.filter((c): c is RosterLanguageCode =>
      (ROSTER_LANGUAGE_CODES as readonly string[]).includes(c)
    ),
    private: {
      personalPhone: p.private?.personalPhone ? formatPhone(p.private.personalPhone) : "",
      personalEmail: p.private?.personalEmail ?? "",
      addressLine1: p.private?.addressLine1 ?? "",
      addressLine2: p.private?.addressLine2 ?? "",
      city: p.private?.city ?? "",
      region: p.private?.region ?? "",
      postalCode: p.private?.postalCode ?? "",
      country: p.private?.country ?? "",
    },
  }
}

interface RosterProfileFormProps {
  profile: RosterProfile
  isSelf: boolean
  onSaved: (profile: RosterProfile) => void
  trigger: React.ReactNode
}

export function RosterProfileForm({ profile, isSelf, onSaved, trigger }: RosterProfileFormProps) {
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateRosterProfileInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updateRosterProfileSchema) as any,
    defaultValues: toFormValues(profile),
  })

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (val) reset(toFormValues(profile))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    try {
      const res = await fetch(apiPath(`/api/roster/${profile.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)
      toast.success("Roster profile saved")
      onSaved(json as RosterProfile)
      setOpen(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  const fieldError = (msg?: string) =>
    msg ? <p className="text-xs text-destructive">{msg}</p> : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isSelf ? "Edit my roster profile" : `Edit ${displayName(profile.name)}`}
          </DialogTitle>
          <DialogDescription>
            Everything here is visible to everyone signed in to the newsroom tools.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* About */}
          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-semibold">About</legend>
            <div className="space-y-1.5">
              <Label htmlFor="rp-title">Title</Label>
              <Input
                id="rp-title"
                {...register("title")}
                placeholder="e.g. Business Editor, Podcast Producer"
                aria-invalid={!!errors.title}
              />
              {fieldError(errors.title?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-work-phone">Work phone</Label>
              <Input
                id="rp-work-phone"
                type="tel"
                {...register("workPhone")}
                placeholder="(503) 555-0123"
                aria-invalid={!!errors.workPhone}
              />
              {fieldError(errors.workPhone?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-pronouns">Pronouns</Label>
              <Input
                id="rp-pronouns"
                {...register("pronouns")}
                placeholder="e.g. she/her, they/them"
                aria-invalid={!!errors.pronouns}
              />
              {fieldError(errors.pronouns?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-languages">Languages spoken</Label>
              <Controller
                name="languages"
                control={control}
                render={({ field }) => (
                  <LanguagePicker
                    id="rp-languages"
                    value={(field.value as string[] | undefined) ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
              {fieldError(errors.languages?.message)}
            </div>
          </fieldset>

          {/* Social */}
          <fieldset className="space-y-4 border-t pt-4">
            <legend className="mb-2 text-sm font-semibold">Social accounts</legend>
            <p className="-mt-2 text-xs text-muted-foreground">
              Paste a handle or a profile link.
            </p>
            {(
              [
                ["xHandle", "X", "@handle"],
                ["blueskyHandle", "Bluesky", "name.bsky.social"],
                ["linkedinSlug", "LinkedIn", "linkedin.com/in/…"],
                ["instagramHandle", "Instagram", "@handle"],
              ] as const
            ).map(([name, label, placeholder]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`rp-${name}`}>{label}</Label>
                <Input
                  id={`rp-${name}`}
                  {...register(name)}
                  placeholder={placeholder}
                  autoComplete="off"
                  aria-invalid={!!errors[name]}
                />
                {fieldError(errors[name]?.message)}
              </div>
            ))}
          </fieldset>

          {/* Personal contact */}
          <fieldset className="space-y-4 border-t pt-4">
            <legend className="mb-2 text-sm font-semibold">Personal contact</legend>
            <p className="-mt-2 text-xs text-muted-foreground">
              Confidential — for newsroom use only, not for public distribution.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rp-phone">Personal phone</Label>
                <Input
                  id="rp-phone"
                  type="tel"
                  {...register("private.personalPhone")}
                  placeholder="(503) 555-0123"
                  aria-invalid={!!errors.private?.personalPhone}
                />
                {fieldError(errors.private?.personalPhone?.message)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-email">Personal email</Label>
                <Input
                  id="rp-email"
                  type="email"
                  {...register("private.personalEmail")}
                  aria-invalid={!!errors.private?.personalEmail}
                />
                {fieldError(errors.private?.personalEmail?.message)}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-addr1">Home address</Label>
              <Input
                id="rp-addr1"
                {...register("private.addressLine1")}
                placeholder="Street address"
                autoComplete="address-line1"
              />
              <Input
                {...register("private.addressLine2")}
                placeholder="Apt, suite, etc. (optional)"
                aria-label="Address line 2"
                autoComplete="address-line2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <Input
                {...register("private.city")}
                placeholder="City"
                aria-label="City"
                autoComplete="address-level2"
                className="col-span-2 sm:col-span-1"
              />
              <Input
                {...register("private.region")}
                placeholder="State"
                aria-label="State or region"
                autoComplete="address-level1"
              />
              <Input
                {...register("private.postalCode")}
                placeholder="ZIP"
                aria-label="ZIP or postal code"
                autoComplete="postal-code"
              />
            </div>
            <Input
              {...register("private.country")}
              placeholder="Country (leave blank for US)"
              aria-label="Country"
              autoComplete="country-name"
            />
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
