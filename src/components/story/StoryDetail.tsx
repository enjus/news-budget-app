"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, MessageSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { StoryForm, type StoryFormHandle } from "./StoryForm"
import { AssignmentSection } from "./AssignmentSection"
import { VisualSection } from "./VisualSection"
import { CommentSection } from "./CommentSection"
import { DeleteDraftDialog } from "./DeleteDraftDialog"
import { StoryVideoSection } from "./StoryVideoSection"
import { VIDEOS_ENABLED } from "@/lib/features"
import { differenceInDays } from "date-fns"
import { STORY_STATUS_LABELS, formatPubDate } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"
import { apiPath } from "@/lib/api-path"

interface StoryDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
  readOnly?: boolean
}

/**
 * Header shortcut down to the comment thread, which stays at the bottom of the
 * page. Renders nothing when there are no comments — an empty thread is not
 * worth a jump target, and the "Comments" heading is already down there.
 */
function CommentJumpLink({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <a
      href="#comments"
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      title={count === 1 ? "1 comment" : `${count} comments`}
    >
      <MessageSquare className="size-3.5 shrink-0" />
      {count}
      <span className="sr-only">
        {count === 1 ? "comment — jump to thread" : "comments — jump to thread"}
      </span>
    </a>
  )
}

export function StoryDetail({ story, onUpdate, readOnly }: StoryDetailProps) {
  const router = useRouter()
  const formRef = useRef<StoryFormHandle>(null)
  const [sendingToBudget, setSendingToBudget] = useState(false)
  const [deletingDraft, setDeletingDraft] = useState(false)

  async function handleDeleteDraft() {
    setDeletingDraft(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Draft deleted")
      router.push("/me")
    } catch {
      toast.error("Failed to delete draft. Please try again.")
      setDeletingDraft(false)
    }
  }

  async function handleSendToBudget() {
    setSendingToBudget(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}/publish`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: story.version }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (res.status === 409 && json?.version !== undefined) {
          toast.error("This story was modified by another user. Reloading…")
          onUpdate()
          return
        }
        throw new Error(json?.error ?? "Failed to send to budget")
      }
      toast.success("Story sent to budget")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send to budget")
    } finally {
      setSendingToBudget(false)
    }
  }

  async function patchStatus(status: string) {
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, version: story.version }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (res.status === 409 && json?.version !== undefined) {
          toast.error("This story was modified by another user. Reloading…")
          onUpdate()
          return
        }
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success("Status updated")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    }
  }

  if (readOnly) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{story.slug}</h1>
            {story.isEnterprise && (
              <Badge variant="secondary" className="mt-1">Enterprise</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CommentJumpLink count={story.comments.length} />
            <Badge variant="outline">{STORY_STATUS_LABELS[story.status] ?? story.status}</Badge>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Budget Line</p>
            <p className="text-sm">{story.budgetLine}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Online Pub Date</p>
              <p className="text-sm">{formatPubDate(story.onlinePubDate, story.onlinePubDateTBD)}</p>
            </div>
            {story.wordCount != null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Word Count</p>
                <p className="text-sm">{story.wordCount}</p>
              </div>
            )}
          </div>
          {story.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{story.notes}</p>
            </div>
          )}
          {story.postUrl && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Published URL</p>
              <Link
                href={story.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
              >
                {story.postUrl}
                <ExternalLink className="size-3 shrink-0" />
              </Link>
            </div>
          )}
          {story.workingDraftUrl &&
            story.status !== "PUBLISHED_FINAL" &&
            story.status !== "PUBLISHED_ITERATING" && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Working Draft</p>
              <Link
                href={story.workingDraftUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
              >
                {story.workingDraftUrl}
                <ExternalLink className="size-3 shrink-0" />
              </Link>
            </div>
          )}
        </div>

        <Separator />

        <AssignmentSection
          storyId={story.id}
          assignments={story.assignments}
          onUpdate={onUpdate}
          readOnly
        />

        <Separator />

        <VisualSection
          storyId={story.id}
          visuals={story.visuals}
          onUpdate={onUpdate}
          readOnly
        />

        {VIDEOS_ENABLED && <Separator />}

        {VIDEOS_ENABLED && <StoryVideoSection story={story} onUpdate={onUpdate} />}

        <Separator />

        <CommentSection
          storyId={story.id}
          comments={story.comments}
          onUpdate={onUpdate}
          hasAssignments={story.assignments.length > 0}
          readOnly
        />

      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{story.slug}</h1>

        <div className="flex items-center gap-2">
          <CommentJumpLink count={story.comments.length} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => formRef.current?.submitNotify()}
          >
            Save & Notify Team
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => formRef.current?.submitNormal()}
          >
            Save Changes
          </Button>

        {!["SHELVED", "PUBLISHED_ITERATING", "PUBLISHED_FINAL"].includes(story.status) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              >
                Shelve Story
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Shelve this story?</AlertDialogTitle>
                <AlertDialogDescription>
                  The story will be moved to the Shelved section and hidden from active budgets.
                  You can restore it by changing its status.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => patchStatus("SHELVED")}>
                  Shelve
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        </div>
      </div>

      {/* Draft banner. A pitch (pitchedAt set) never reaches StoryDetail — see
          StoryDetailWrapper, which routes those to PitchDetail instead (§6). */}
      {!story.onBudget && story.pitchedAt === null && (
        <div className="flex items-center justify-between rounded-lg border border-dashed bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            This draft was created by {story.createdByUser?.name ?? "an unknown user"}. Only the
            creator and assigned users can see it until it&apos;s added to the budget.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <DeleteDraftDialog slug={story.slug} disabled={deletingDraft} onDelete={handleDeleteDraft} />
            <Button
              size="sm"
              className="gap-1"
              disabled={sendingToBudget}
              onClick={handleSendToBudget}
            >
              <Send className="size-3" />
              {sendingToBudget ? "Sending..." : "Send to Budget"}
            </Button>
          </div>
        </div>
      )}

      {/* Shelved countdown banner */}
      {story.status === "SHELVED" && story.shelvedAt && (() => {
        const daysShelved = differenceInDays(new Date(), new Date(story.shelvedAt))
        const daysLeft = 90 - daysShelved
        const urgent = daysLeft <= 14
        return (
          <div className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${urgent ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-yellow-500/40 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400"}`}>
            <span className="font-semibold">
              {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} until auto-deletion` : "Scheduled for deletion"}
            </span>
            <span className="text-muted-foreground">
              — shelved {daysShelved} day{daysShelved === 1 ? "" : "s"} ago. Change status to restore.
            </span>
          </div>
        )
      })()}

      {/* Form — always editable, remounts when story is saved */}
      <StoryForm
        ref={formRef}
        key={String(story.updatedAt)}
        story={story}
        onSuccess={() => onUpdate()}
      />

      <Separator />

      <AssignmentSection
        storyId={story.id}
        assignments={story.assignments}
        onUpdate={onUpdate}
      />

      <Separator />

      <VisualSection
        storyId={story.id}
        visuals={story.visuals}
        onUpdate={onUpdate}
      />

      {VIDEOS_ENABLED && <Separator />}

      {VIDEOS_ENABLED && <StoryVideoSection story={story} onUpdate={onUpdate} />}

      <Separator />

      <CommentSection
        storyId={story.id}
        comments={story.comments}
        onUpdate={onUpdate}
        hasAssignments={story.assignments.length > 0}
      />

      <Separator />

      {/* Bottom action row — mirrors header */}
      <div className="flex justify-end gap-2 pb-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => formRef.current?.submitNotify()}
        >
          Save & Notify Team
        </Button>
        <Button
          type="button"
          onClick={() => formRef.current?.submitNormal()}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}
