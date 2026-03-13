"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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
import { PersonBadge } from "@/components/people/PersonBadge"
import { PersonPicker } from "@/components/people/PersonPicker"
import { MediaRequestForm, type MediaRequestFormHandle } from "./MediaRequestForm"
import {
  MEDIA_REQUEST_STATUS_LABELS,
  MEDIA_REQUEST_TYPE_LABELS,
  MEDIA_ASSIGNMENT_ROLE_LABELS,
  mediaRequestStatusColor,
  cn,
} from "@/lib/utils"
import type { MediaRequestWithRelations } from "@/types/index"
import { ExternalLink, Plus, Trash2, Link as LinkIcon } from "lucide-react"

interface MediaRequestDetailProps {
  mediaRequest: MediaRequestWithRelations
  onUpdate: () => void
}

export function MediaRequestDetail({ mediaRequest, onUpdate }: MediaRequestDetailProps) {
  const formRef = useRef<MediaRequestFormHandle>(null)
  const router = useRouter()
  const { data: session } = useSession()
  const [declineReason, setDeclineReason] = useState("")
  const [newLinkUrl, setNewLinkUrl] = useState("")
  const [newLinkLabel, setNewLinkLabel] = useState("")

  const isAdmin = session?.user?.appRole === "ADMIN"

  async function patchStatus(status: string, extra?: Record<string, string>) {
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      toast.success(`Status updated to ${MEDIA_REQUEST_STATUS_LABELS[status] ?? status}`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    }
  }

  async function handleAddAssignment(person: { id: string; name: string }, role: string) {
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, role }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed (${res.status})`)
      }
      toast.success(`${person.name} assigned`)
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add assignment")
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}/assignments/${assignmentId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove assignment")
      toast.success("Assignment removed")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove assignment")
    }
  }

  async function handleAddDataLink() {
    if (!newLinkUrl) return
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}/data-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newLinkUrl, label: newLinkLabel || null }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed (${res.status})`)
      }
      toast.success("Link added")
      setNewLinkUrl("")
      setNewLinkLabel("")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add link")
    }
  }

  async function handleRemoveDataLink(linkId: string) {
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}/data-links/${linkId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove link")
      toast.success("Link removed")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove link")
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/media-requests/${mediaRequest.id}`, { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed (${res.status})`)
      }
      toast.success("Request deleted")
      router.push("/media-requests")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  const assignedIds = mediaRequest.assignments.map((a) => a.person.id)

  // Status transition buttons
  const statusButtons = []
  const s = mediaRequest.status
  if (s === "REQUESTED" || s === "ASSIGNED") {
    statusButtons.push({ label: "Start Work", status: "IN_PROGRESS" })
  }
  if (s === "IN_PROGRESS") {
    statusButtons.push({ label: "Mark Complete", status: "COMPLETED" })
  }
  if (s === "COMPLETED") {
    statusButtons.push({ label: "Mark Delivered", status: "DELIVERED" })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{mediaRequest.title}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {MEDIA_REQUEST_TYPE_LABELS[mediaRequest.type] ?? mediaRequest.type}
            </Badge>
            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", mediaRequestStatusColor(mediaRequest.status))}>
              {MEDIA_REQUEST_STATUS_LABELS[mediaRequest.status] ?? mediaRequest.status}
            </span>
            {mediaRequest.priority === "URGENT" && (
              <Badge variant="destructive" className="text-xs">
                Urgent
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => formRef.current?.submit()}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* Decline reason display */}
      {mediaRequest.status === "DECLINED" && mediaRequest.declineReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <span className="font-semibold text-red-800 dark:text-red-400">Declined:</span>{" "}
          <span className="text-red-700 dark:text-red-300">{mediaRequest.declineReason}</span>
        </div>
      )}

      {/* Linked story */}
      {mediaRequest.story && (
        <div className="text-sm text-muted-foreground">
          Linked to story:{" "}
          <a href={`/stories/${mediaRequest.story.id}`} className="font-medium text-foreground hover:underline">
            {mediaRequest.story.slug}
          </a>
        </div>
      )}

      {/* Form */}
      <MediaRequestForm
        ref={formRef}
        key={String(mediaRequest.updatedAt)}
        mediaRequest={mediaRequest}
        requestedById={mediaRequest.requestedById}
        onSuccess={() => onUpdate()}
      />

      <Separator />

      {/* Assignments */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Assignments
        </h3>
        {mediaRequest.assignments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {mediaRequest.assignments.map((a) => (
              <PersonBadge
                key={a.id}
                person={a.person}
                role={MEDIA_ASSIGNMENT_ROLE_LABELS[a.role] ?? a.role}
                onRemove={() => handleRemoveAssignment(a.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        )}
        <PersonPicker
          onSelect={handleAddAssignment}
          excludeIds={assignedIds}
          label="Assign specialist"
          roles={["PHOTOGRAPHER", "VIDEOGRAPHER", "GRAPHIC_DESIGNER", "OTHER"]}
        />
      </div>

      <Separator />

      {/* Data Links */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Data & Links
        </h3>
        {mediaRequest.dataLinks.length > 0 ? (
          <div className="space-y-1.5">
            {mediaRequest.dataLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 text-sm">
                <LinkIcon className="size-3 shrink-0 text-muted-foreground" />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-blue-600 hover:underline dark:text-blue-400"
                >
                  {link.label || link.url}
                </a>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                <button
                  onClick={() => handleRemoveDataLink(link.id)}
                  className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No links yet.</p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Input
              placeholder="https://..."
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="w-32 space-y-1">
            <Input
              placeholder="Label (optional)"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleAddDataLink} disabled={!newLinkUrl}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>
      </div>

      <Separator />

      {/* Status actions */}
      <div className="flex flex-wrap items-center gap-2">
        {statusButtons.map((btn) => (
          <Button
            key={btn.status}
            size="sm"
            variant="outline"
            onClick={() => patchStatus(btn.status)}
          >
            {btn.label}
          </Button>
        ))}

        {/* Decline */}
        {!["DECLINED", "CANCELED", "DELIVERED"].includes(s) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30">
                Decline
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Decline this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  Please provide a reason for declining.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="Reason for declining..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={!declineReason.trim()}
                  onClick={() => patchStatus("DECLINED", { declineReason: declineReason.trim() })}
                >
                  Decline
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Cancel */}
        {!["CANCELED", "DELIVERED", "DECLINED"].includes(s) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-muted-foreground">
                Cancel Request
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  The request will be marked as canceled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => patchStatus("CANCELED")}>
                  Cancel Request
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Delete */}
        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 ml-auto">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}
