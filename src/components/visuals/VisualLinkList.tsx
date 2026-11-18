import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { linkHref } from "@/lib/visual-requests"

interface VisualLinkListProps {
  /** Stored links, as visualLinks() returns them. */
  links: string[]
  /**
   * "full" (the request page): each full URL on its own line.
   * "compact" (the story page's Visuals row): each link as its host name, inline.
   */
  variant?: "full" | "compact"
  className?: string
}

function hostOf(href: string): string {
  try {
    return new URL(href).host
  } catch {
    return href
  }
}

/**
 * A request's links. Each one becomes an href only after linkHref()
 * (parseDataUrl) passes again, whatever the database holds; one that fails is
 * shown as plain text. Renders nothing for an empty list.
 */
export function VisualLinkList({ links, variant = "full", className }: VisualLinkListProps) {
  if (links.length === 0) return null
  const compact = variant === "compact"
  return (
    <ul className={cn(compact ? "flex flex-wrap gap-x-3 gap-y-1" : "space-y-1", className)}>
      {links.map((link, i) => {
        const href = linkHref(link)
        return (
          <li key={`${i}-${link}`} className="min-w-0">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={href}
                className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                <span className={compact ? "truncate" : "break-all"}>{compact ? hostOf(href) : href}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span className={cn("text-muted-foreground", compact ? "truncate" : "break-all")}>{link}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
