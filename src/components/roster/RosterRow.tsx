import Link from "next/link"
import { SocialLinks } from "@/components/roster/SocialLinks"
import { LanguageChip } from "@/components/roster/LanguageChip"
import { formatPhone } from "@/lib/roster"
import { displayName } from "@/lib/utils"
import type { RosterListItem } from "@/types/index"

/** One person in a roster list (/roster, and the table under /roster/map). */
export function RosterRow({ person: p }: { person: RosterListItem }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
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
  )
}
