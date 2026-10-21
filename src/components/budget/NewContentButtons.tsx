"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { canCreateContent } from "@/lib/utils"
import { VIDEOS_ENABLED } from "@/lib/features"

interface NewContentButtonsProps {
  /** Prefill query for the story form, e.g. "/stories/new?isEnterprise=true". */
  storyHref?: string
  /** False where videos don't apply (print editions). */
  showVideo?: boolean
}

/**
 * New Story / New Video buttons for a budget view's header. These are the
 * only create entry points — TopNav deliberately has none (see CLAUDE.md).
 * Renders a fragment so it drops into the caller's existing flex row.
 */
export function NewContentButtons({ storyHref = "/stories/new", showVideo = true }: NewContentButtonsProps) {
  const { data: session } = useSession()
  if (!canCreateContent(session?.user?.appRole ?? "")) return null

  return (
    <>
      <Button asChild size="sm">
        <Link href={storyHref}>
          <Plus className="size-4" />
          New Story
        </Link>
      </Button>
      {showVideo && VIDEOS_ENABLED && (
        <Button asChild size="sm">
          <Link href="/videos/new">
            <Plus className="size-4" />
            New Video
          </Link>
        </Button>
      )}
    </>
  )
}
