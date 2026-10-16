import { socialDisplay, socialUrl, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/roster"

interface SocialFields {
  xHandle: string | null
  blueskyHandle: string | null
  linkedinSlug: string | null
  instagramHandle: string | null
}

export function socialEntries(p: SocialFields): { platform: SocialPlatform; handle: string }[] {
  const entries: { platform: SocialPlatform; handle: string | null }[] = [
    { platform: "x", handle: p.xHandle },
    { platform: "bluesky", handle: p.blueskyHandle },
    { platform: "linkedin", handle: p.linkedinSlug },
    { platform: "instagram", handle: p.instagramHandle },
  ]
  return entries.filter((e): e is { platform: SocialPlatform; handle: string } => !!e.handle)
}

/**
 * Social profile links. `compact` renders short platform chips (list rows);
 * the default renders "Platform  @handle" lines (profile page).
 */
export function SocialLinks({ person, compact = false }: { person: SocialFields; compact?: boolean }) {
  const entries = socialEntries(person)
  if (entries.length === 0) return null

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(({ platform, handle }) => (
          <a
            key={platform}
            href={socialUrl(platform, handle)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${SOCIAL_PLATFORM_LABELS[platform]}: ${socialDisplay(platform, handle)}`}
            className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {SOCIAL_PLATFORM_LABELS[platform]}
          </a>
        ))}
      </div>
    )
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(({ platform, handle }) => (
        <div key={platform} className="contents">
          <dt className="text-muted-foreground">{SOCIAL_PLATFORM_LABELS[platform]}</dt>
          <dd className="min-w-0 truncate">
            <a
              href={socialUrl(platform, handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {socialDisplay(platform, handle)}
            </a>
          </dd>
        </div>
      ))}
    </dl>
  )
}
