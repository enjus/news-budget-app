"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ArrowLeft, Ban, CheckCircle2, Hand, Link2, Pencil, Play, Trash2, Undo2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PersonSelect } from "@/components/people/PersonSelect"
import { VisualRequestForm } from "@/components/story/VisualRequestForm"
import { apiPath } from "@/lib/api-path"
import { formatPubDate, formatTimestampPacific } from "@/lib/utils"
import { availableVisualActions, visualLinks, type VisualButton } from "@/lib/visual-requests"
import { VisualLinkList } from "./VisualLinkList"
import { VISUAL_TYPE_LABELS, type VisualTypeValue } from "@/lib/visual-types"
import type { VisualRequestDetail } from "@/types/index"
import { AttachStoryDialog } from "./AttachStoryDialog"
import { UrgentBadge, VisualStatusBadge } from "./VisualStatusBadge"

const TEXTAREA_CLASS =
  "w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"

const CONFIRM_COPY = {
  cancel: {
    title: "Cancel this request?",
    body: "The desk stops working on it. This can't be undone.",
    keep: "Keep request",
    action: "Cancel request",
  },
  delete: {
    title: "Delete this request?",
    body: "It's removed for good, including from any story it's on.",
    keep: "Keep it",
    action: "Delete",
  },
  release: {
    title: "Release this request?",
    body: "You're taken off it and it goes back to the queue, unassigned, for someone else to pick up.",
    keep: "Keep it",
    action: "Release",
  },
} as const

interface RequestDetailProps {
  request: VisualRequestDetail
  onUpdate: () => void
}

/** One label/value row; nothing is rendered for an empty value. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/**
 * A visual request's page (/requests/[id]): the one place its lifecycle is
 * worked. Buttons come from availableVisualActions(), so each one shown is an
 * action the PATCH/DELETE routes would accept; the server still checks.
 */
export function RequestDetail({ request, onUpdate }: RequestDetailProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [confirm, setConfirm] = useState<"cancel" | "delete" | "release" | null>(null)

  const actor = session?.user ? { role: session.user.appRole, personId: session.user.personId ?? null } : null
  const buttons = new Set<VisualButton>(actor ? availableVisualActions(actor, request) : [])

  const typeLabel = VISUAL_TYPE_LABELS[request.type as VisualTypeValue] ?? request.type
  // `links`, or the legacy single dataUrl on an older request.
  const links = visualLinks(request)

  /** PATCH the request; toasts the server's error and returns false on failure. */
  async function patch(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(apiPath(`/api/visuals/${request.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to update request (${res.status})`)
      }
      toast.success(success)
      onUpdate()
      return true
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update request")
      onUpdate() // someone else may have changed it; show the current state
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      const res = await fetch(apiPath(`/api/visuals/${request.id}`), { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to delete request (${res.status})`)
      }
      toast.success("Request deleted")
      router.push(request.story ? `/stories/${request.story.id}` : "/requests")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete request")
      setBusy(false)
    }
  }

  async function handleDecline() {
    const reason = declineReason.trim()
    if (!reason) return
    if (await patch({ status: "DECLINED", declineReason: reason }, "Request declined")) {
      setDeclineOpen(false)
      setDeclineReason("")
    }
  }

  const hasActions = buttons.size > 0

  return (
    <div className="space-y-6">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Requests
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{typeLabel} request</h1>
          <VisualStatusBadge status={request.status} />
          {request.priority === "URGENT" && <UrgentBadge />}
        </div>
        {request.description && <p className="whitespace-pre-wrap text-base">{request.description}</p>}
      </header>

      <section className="rounded-lg border px-4 py-3">
        {request.story ? (
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Story</p>
            <Link href={`/stories/${request.story.id}`} className="font-medium underline-offset-4 hover:underline">
              {request.story.slug}
            </Link>
            <p className="text-sm text-muted-foreground">{request.story.budgetLine}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not attached to a story.</p>
        )}
      </section>

      {hasActions && !editing && (
        <section aria-label="Actions" className="flex flex-wrap items-center gap-2">
          {buttons.has("assign") && (
            <div className="flex items-center gap-2">
              <Label htmlFor="request-assignee" className="text-sm">
                {request.personId ? "Reassign" : "Assign"}
              </Label>
              <PersonSelect
                id="request-assignee"
                value={request.personId}
                fallbackLabel={request.person?.name}
                placeholder="Choose a person"
                noneLabel="Unassigned"
                className="h-8 w-[200px]"
                onChange={(personId) => {
                  // A request's assignee can't be cleared, so "none" does nothing.
                  if (personId && personId !== request.personId) {
                    patch({ personId }, request.personId ? "Request reassigned" : "Request assigned")
                  }
                }}
              />
            </div>
          )}
          {buttons.has("claim") && actor?.personId && (
            <Button size="sm" disabled={busy} onClick={() => patch({ personId: actor.personId }, "You claimed this request")}>
              <Hand className="size-4" /> Claim
            </Button>
          )}
          {buttons.has("start") && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "IN_PROGRESS" }, "Marked in progress")}>
              <Play className="size-4" /> Start
            </Button>
          )}
          {buttons.has("deliver") && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "DELIVERED" }, "Marked delivered")}>
              <CheckCircle2 className="size-4" /> Mark delivered
            </Button>
          )}
          {buttons.has("release") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("release")}>
              <Undo2 className="size-4" /> Release
            </Button>
          )}
          {buttons.has("edit") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit details
            </Button>
          )}
          {buttons.has("attach") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setAttachOpen(true)}>
              <Link2 className="size-4" /> {request.story ? "Move to another story" : "Attach to story"}
            </Button>
          )}
          {buttons.has("decline") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeclineOpen(true)}>
              <XCircle className="size-4" /> Decline
            </Button>
          )}
          {buttons.has("cancel") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("cancel")}>
              <Ban className="size-4" /> Cancel request
            </Button>
          )}
          {buttons.has("delete") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm("delete")}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
        </section>
      )}

      {editing && (
        <VisualRequestForm
          editing={{ id: request.id, initial: request }}
          onSubmitted={() => {
            setEditing(false)
            onUpdate()
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <dl className="divide-y rounded-lg border px-4 py-1">
        <Row label="Requested by">{request.requestedBy?.name ?? "A deleted person"}</Row>
        <Row label="Filed">{formatTimestampPacific(request.createdAt)}</Row>
        <Row label="Assigned to">
          {request.person ? (
            <>
              {request.person.name}
              {!request.person.isActive && <span className="text-muted-foreground"> (inactive)</span>}
            </>
          ) : (
            <span className="italic text-muted-foreground">Unassigned</span>
          )}
        </Row>
        <Row label="Event">{request.eventDateTime && formatPubDate(request.eventDateTime, false)}</Row>
        <Row label="Location">{request.location}</Row>
        <Row label="Needed by">{request.deadline && formatPubDate(request.deadline, false)}</Row>
        <Row label={links.length > 1 ? "Links" : "Link"}>
          {links.length > 0 ? <VisualLinkList links={links} /> : null}
        </Row>
        <Row label="Notes">{request.notes && <span className="whitespace-pre-wrap">{request.notes}</span>}</Row>
        <Row label="Decline reason">{request.status === "DECLINED" ? request.declineReason : null}</Row>
        <Row label="Last updated">{formatTimestampPacific(request.updatedAt)}</Row>
      </dl>

      <AttachStoryDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        currentStoryId={request.storyId}
        onPick={(story) =>
          patch({ storyId: story.id }, request.story ? `Moved to ${story.slug}` : `Attached to ${story.slug}`)
        }
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this request?</DialogTitle>
            <DialogDescription>The reason is shown on the request and the story.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason</Label>
            <textarea
              id="decline-reason"
              className={TEXTAREA_CLASS}
              rows={3}
              maxLength={500}
              autoComplete="off"
              required
              aria-required
              placeholder="e.g. No photographer free that night; use a file photo"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)} disabled={busy}>
              Keep request
            </Button>
            <Button variant="destructive" onClick={handleDecline} disabled={busy || !declineReason.trim()}>
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{CONFIRM_COPY[confirm ?? "cancel"].title}</AlertDialogTitle>
            <AlertDialogDescription>{CONFIRM_COPY[confirm ?? "cancel"].body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{CONFIRM_COPY[confirm ?? "cancel"].keep}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirm === "delete"
                  ? handleDelete()
                  : confirm === "release"
                    ? patch({ status: "REQUESTED" }, "Released back to the queue")
                    : patch({ status: "CANCELED" }, "Request canceled")
              }
            >
              {CONFIRM_COPY[confirm ?? "cancel"].action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
