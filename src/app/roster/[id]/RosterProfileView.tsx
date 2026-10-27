"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { mutate as mutateGlobal } from "swr"
import { ArrowLeft, Eye, Mail, MapPin, Pencil, Phone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SocialLinks, socialEntries } from "@/components/roster/SocialLinks"
import { RosterProfileForm } from "@/components/roster/RosterProfileForm"
import { LocationPickerDialog } from "@/components/roster/LocationPickerDialog"
import { PrivateReminderDialog, hasPrivateAck, setPrivateAck } from "@/components/roster/PrivateReminderDialog"
import { useRosterProfile } from "@/lib/hooks/useRoster"
import { LanguageChip } from "@/components/roster/LanguageChip"
import { formatAddressLines, formatPhone } from "@/lib/roster"
import type { RosterProfile } from "@/types/index"
import { TEAM_MEMBER_ROLE_LABELS, canEditRosterProfile, canViewPeople, displayName } from "@/lib/utils"

export function RosterProfileView({ id }: { id: string }) {
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const viewerPersonId = session?.user?.personId
  const isSelf = viewerPersonId === id
  const canEdit = canEditRosterProfile(appRole, viewerPersonId, id)

  const { profile, isLoading, error, mutate } = useRosterProfile(id)
  const [revealed, setRevealed] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this profile.
      </p>
    )
  }

  if (isLoading || !profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  const priv = profile.private
  const addressLines = priv ? formatAddressLines(priv) : []
  const hasContact = !!(priv?.personalPhone || priv?.personalEmail || addressLines.length)
  const pin =
    priv?.latitude != null && priv.longitude != null
      ? { latitude: priv.latitude, longitude: priv.longitude }
      : null
  // A map pin is as private as the address, so it sits behind the same reveal.
  const hasPrivate = hasContact || !!pin
  // Your own details need no reminder.
  const showPrivate = isSelf || revealed
  // Inactive people are never mapped (the location API refuses them). With no
  // pin there's nothing to hide, so editors get "Add to map" before revealing.
  const showLocation =
    profile.isActive && (showPrivate ? !!pin || canEdit : !pin && canEdit)
  const onSaved = (updated: RosterProfile) => {
    mutate(updated, { revalidate: false })
    // The list caches pronouns/languages/socials too — refetch it so
    // going back to /roster doesn't show the pre-edit values.
    mutateGlobal("/api/roster")
  }
  // The list carries no location, so a pin change only updates the profile.
  const onLocationSaved = (updated: RosterProfile) => mutate(updated, { revalidate: false })

  function handleReveal() {
    if (hasPrivateAck()) setRevealed(true)
    else setReminderOpen(true)
  }

  return (
    <div className="space-y-6">
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Roster
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{displayName(profile.name)}</h1>
            {profile.pronouns && (
              <span className="text-sm text-muted-foreground">({profile.pronouns})</span>
            )}
            {!profile.isActive && (
              <Badge variant="outline" className="text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          {(profile.title || profile.email || profile.workPhone) && (
            <p className="text-sm text-muted-foreground">
              {[
                profile.title,
                profile.email && (
                  <a href={`mailto:${profile.email}`} className="hover:underline">
                    {profile.email}
                  </a>
                ),
                profile.workPhone && (
                  <a href={`tel:${profile.workPhone}`} className="hover:underline">
                    {formatPhone(profile.workPhone)}
                  </a>
                ),
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {part}
                  </span>
                ))}
            </p>
          )}
          {canViewPeople(appRole) && (
            <Link href={`/people/${profile.id}`} className="text-xs text-muted-foreground hover:underline">
              View assignments →
            </Link>
          )}
        </div>

        {canEdit && (
          <RosterProfileForm
            profile={profile}
            isSelf={isSelf}
            onSaved={onSaved}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil className="size-4" />
                Edit
              </Button>
            }
          />
        )}
      </div>

      {/* Public profile */}
      <section className="space-y-4 rounded-lg border p-4">
        {/* Admin-managed (/admin/teams), not part of the editable profile —
            so it's simply omitted when someone isn't on a team. */}
        {profile.teamMemberships.length > 0 && (
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {profile.teamMemberships.length === 1 ? "Team" : "Teams"}
            </h2>
            <ul className="space-y-0.5 text-sm">
              {profile.teamMemberships.map(({ team, role }) => (
                <li key={team.id}>
                  {team.name}
                  {role === "EDITOR" && (
                    <span className="text-muted-foreground"> · {TEAM_MEMBER_ROLE_LABELS[role]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold">Languages</h2>
          {profile.languages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.languages.map((code) => (
                <LanguageChip key={code} code={code} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">None listed</p>
          )}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold">Social</h2>
          {socialEntries(profile).length > 0 ? (
            <SocialLinks person={profile} />
          ) : (
            <p className="text-sm text-muted-foreground">None listed</p>
          )}
        </div>
      </section>

      {/* Personal contact */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Personal contact</h2>
          <span className="text-xs text-muted-foreground">Not for public distribution</span>
        </div>

        {hasPrivate && !showPrivate ? (
          <Button size="sm" variant="outline" onClick={handleReveal}>
            <Eye className="size-4" />
            Show contact details
          </Button>
        ) : !hasContact ? (
          <p className="text-sm text-muted-foreground">
            None listed{canEdit && " — use Edit to add a phone, email, or address"}.
          </p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {priv?.personalPhone && (
              <>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="size-3.5" /> Phone
                </dt>
                <dd>
                  <a href={`tel:${priv.personalPhone}`} className="hover:underline">
                    {formatPhone(priv.personalPhone)}
                  </a>
                </dd>
              </>
            )}
            {priv?.personalEmail && (
              <>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="size-3.5" /> Email
                </dt>
                <dd className="min-w-0 truncate">
                  <a href={`mailto:${priv.personalEmail}`} className="hover:underline">
                    {priv.personalEmail}
                  </a>
                </dd>
              </>
            )}
            {addressLines.length > 0 && (
              <>
                <dt className="text-muted-foreground">Home</dt>
                <dd>
                  <address className="not-italic">
                    {addressLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </address>
                </dd>
              </>
            )}
          </dl>
        )}

        {showLocation && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" />
              {pin ? (
                <>
                  On the{" "}
                  <Link href="/roster/map" className="hover:text-foreground hover:underline">
                    roster map
                  </Link>
                </>
              ) : (
                "Not on the roster map"
              )}
            </span>
            {canEdit && (
              <LocationPickerDialog
                personId={profile.id}
                personName={profile.name}
                isSelf={isSelf}
                current={pin}
                onSaved={onLocationSaved}
                trigger={
                  <Button size="sm" variant="outline">
                    {pin ? "Edit location" : "Add to map"}
                  </Button>
                }
              />
            )}
          </div>
        )}
      </section>

      <PrivateReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        onConfirm={() => {
          setPrivateAck()
          setRevealed(true)
        }}
      />
    </div>
  )
}
