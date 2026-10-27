"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Download, Map as MapIcon, Search, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SocialLinks } from "@/components/roster/SocialLinks"
import { LanguageChip } from "@/components/roster/LanguageChip"
import { PrivateReminderDialog } from "@/components/roster/PrivateReminderDialog"
import { StaffFilter, matchesStaffFilter, type StaffFilterValue } from "@/components/roster/StaffFilter"
import { apiPath } from "@/lib/api-path"
import { useRoster } from "@/lib/hooks/useRoster"
import { languageLabel } from "@/lib/languages"
import { formatPhone } from "@/lib/roster"
import { displayName } from "@/lib/utils"

export function RosterView() {
  const { data: session } = useSession()
  const myPersonId = session?.user?.personId
  const { people, isLoading, error } = useRoster()
  const [query, setQuery] = useState("")
  const [language, setLanguage] = useState("all")
  const [staffFilter, setStaffFilter] = useState<StaffFilterValue>("staff")
  const [exportOpen, setExportOpen] = useState(false)

  // A plain navigation to the CSV route: the response's Content-Disposition
  // makes it a download, and the session cookie authenticates it.
  function downloadCsv() {
    const a = document.createElement("a")
    a.href = apiPath("/api/roster/export")
    a.download = ""
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Only offer languages someone on the roster actually speaks.
  const languageOptions = useMemo(() => {
    const codes = new Set(people.flatMap((p) => p.languages))
    return Array.from(codes).sort((a, b) => languageLabel(a).localeCompare(languageLabel(b)))
  }, [people])

  const q = query.trim().toLowerCase()
  const visible = people.filter((p) => {
    if (!matchesStaffFilter(p, staffFilter)) return false
    if (language !== "all" && !p.languages.includes(language)) return false
    if (q && !displayName(p.name).toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/roster/map">
              <MapIcon className="size-4" />
              Map
            </Link>
          </Button>
          {myPersonId && (
            <Button asChild size="sm" variant="outline">
              <Link href="/roster/me">
                <UserRound className="size-4" />
                My profile
              </Link>
            </Button>
          )}
          {/* The export is staff only (ROSTER_WHERE), so it's hidden under
              the other filters rather than implying freelancers are included. */}
          {staffFilter === "staff" && (
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="size-4" />
              Download CSV
            </Button>
          )}
        </div>
      </div>

      {/* Shown on every download, not once per session like the profile
          reminder: a file on disk outlives the session and can be forwarded. */}
      <PrivateReminderDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onConfirm={downloadCsv}
        confirmLabel="Download"
        extra={
          <>
            The file includes everyone&apos;s personal contact details and home
            address. It&apos;s meant as an offline backup for emergencies &mdash;
            keep it on a password-protected device, don&apos;t email or upload it,
            and replace it with a fresh copy periodically.
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search by name"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="h-8 w-[180px] text-sm" aria-label="Filter by language">
            <SelectValue placeholder="Any language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any language</SelectItem>
            {languageOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {languageLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <StaffFilter value={staffFilter} onChange={setStaffFilter} />
      </div>

      {error ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Failed to load the roster.</p>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">No one matches those filters.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visible.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 sm:w-48 sm:shrink-0 lg:w-56">
                <Link href={`/roster/${p.id}`} className="font-medium hover:underline">
                  {displayName(p.name)}
                </Link>
                {p.pronouns && (
                  <span className="ml-1.5 text-xs text-muted-foreground">({p.pronouns})</span>
                )}
                {p.title && <p className="text-xs text-muted-foreground">{p.title}</p>}
              </div>
              {/* Work contact only — personal details stay on the profile,
                  behind the reminder. */}
              <div className="min-w-0 text-sm text-muted-foreground empty:hidden sm:w-52 sm:shrink-0 sm:empty:block lg:w-64">
                {p.email && (
                  <a href={`mailto:${p.email}`} className="block truncate hover:underline">
                    {p.email}
                  </a>
                )}
                {p.workPhone && (
                  <a href={`tel:${p.workPhone}`} className="block hover:underline">
                    {formatPhone(p.workPhone)}
                  </a>
                )}
              </div>
              {/* One wrapping area, so at narrow widths the socials drop to
                  their own line rather than overlapping the language chips. */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {p.languages.map((code) => (
                    <LanguageChip key={code} code={code} />
                  ))}
                </div>
                <SocialLinks person={p} compact />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Personal contact details on profiles are confidential — not for public distribution.
      </p>
    </div>
  )
}
