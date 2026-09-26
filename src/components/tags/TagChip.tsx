import Link from "next/link"
import { cn } from "@/lib/utils"
import { tagChipClass, tagHref, humanizeTagKey } from "@/lib/tags"
import { renderTagIcon } from "@/components/tags/tag-icons"
import type { TagRecord } from "@/lib/hooks/useTags"

type ChipTag = Pick<TagRecord, "key" | "label" | "abbrev" | "color" | "icon">

/**
 * One admin-managed tag rendered as a chip. `tag` may be undefined when the
 * key has no Tag row (shouldn't happen once ensureDefaultTags has run) — the
 * chip then falls back to a neutral humanized key.
 *
 * With `link`, the chip is a nested Link to the tag's view. It stops click
 * propagation so a surrounding card Link doesn't also navigate; callers must
 * pass link={false} while the card is in select/drag mode so the card's own
 * click handling still wins.
 */
export function TagChip({
  tagKey,
  tag,
  text = "abbrev",
  link = false,
  className,
  iconClassName,
}: {
  tagKey: string
  tag: ChipTag | undefined
  text?: "abbrev" | "label"
  link?: boolean
  className?: string
  iconClassName?: string
}) {
  const label = tag?.label ?? humanizeTagKey(tagKey)
  const shown = text === "abbrev" ? (tag?.abbrev || label) : label
  const classes = cn("inline-flex items-center gap-0.5 rounded-md font-medium", tagChipClass(tag?.color), className)
  const content = (
    <>
      {renderTagIcon(tag?.icon, cn("pointer-events-none", iconClassName))}
      {shown}
    </>
  )

  if (link) {
    return (
      <Link
        href={tagHref(tagKey)}
        onClick={(e) => e.stopPropagation()}
        className={cn(classes, "hover:underline")}
        title={label}
      >
        {content}
      </Link>
    )
  }
  return <span className={classes} title={label}>{content}</span>
}
