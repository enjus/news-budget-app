import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteDraftDialogProps {
  /** Shown in the confirmation copy, e.g. a story/video slug. */
  slug: string
  disabled?: boolean
  onDelete: () => void
  /** Icon-only trigger for list rows (e.g. "My Drafts"), vs. icon+label for
   *  detail-page draft banners. Defaults to the icon+label form. */
  compact?: boolean
  /** What to call the thing being deleted in the confirmation copy — a pitch
   *  isn't a "draft" in the newsroom sense the default wording implies. */
  noun?: string
}

/** Shared "permanently delete this draft" confirmation, used by the draft
 *  banners on StoryDetail/VideoDetail, the "My Drafts" list on /me, and
 *  PitchDetail (via `noun="pitch"`). Only the trigger + dialog JSX is shared —
 *  each caller keeps its own delete fetch/navigation logic, since that differs
 *  (MeView stays on the page and refreshes its list; the detail pages
 *  navigate back to /me or /budget/pitches). */
export function DeleteDraftDialog({ slug, disabled, onDelete, compact, noun = "draft" }: DeleteDraftDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={
            compact
              ? "shrink-0 h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              : "gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
          }
          disabled={disabled}
          aria-label={compact ? `Delete ${noun}` : undefined}
        >
          <Trash2 className="size-3" />
          {!compact && "Delete"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{slug}&rdquo; will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onDelete}
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
