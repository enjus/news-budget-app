"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { addDays } from "date-fns"
import { CalendarPlus, Infinity as InfinityIcon, Send, UserMinus, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { PersonPicker, type AssignmentRoleValue } from "@/components/people/PersonPicker"
import { PitchExpiryBadge } from "@/components/budget/PitchExpiryBadge"
import { CommentSection } from "./CommentSection"
import { DeleteDraftDialog } from "./DeleteDraftDialog"
import { apiPath } from "@/lib/api-path"
import { displayName, formatTimestampPacific, hasAdminAccess, hasElevatedAccess } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

interface PitchDetailProps {
  story: StoryWithRelations
  onUpdate: () => void
  readOnly?: boolean
}

/**
 * The pitch detail page (issue #24 §6 + the mockup's "screen 3"). A pitch is
 * a Story row (§2), but its detail page deliberately isn't StoryDetail with a
 * banner bolted on — nothing here shows StoryForm/AssignmentSection/
 * VisualSection, since none of that applies until Send to Budget makes it a
 * real budget item (at which point StoryDetailWrapper swaps to StoryDetail).
 * Comments are promoted near the top instead of buried under all of that —
 * discussion is the actual mechanism for adding information to a pitch.
 *
 * Single-claimant model: `story.assignments[0]` is treated as *the* claimant,
 * same simplification PitchRow already makes. There's no product case for
 * more than one, so the UI doesn't design for it (see chat — multi-claim
 * dropped by request). The claim/unclaim APIs still permit multiple rows;
 * this is a UI simplification, not a schema or route change.
 */
export function PitchDetail({ story, onUpdate, readOnly }: PitchDetailProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [working, setWorking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [showOtherPicker, setShowOtherPicker] = useState(false)
  const [slug, setSlug] = useState(story.slug)
  const [budgetLine, setBudgetLine] = useState(story.budgetLine)

  const myPersonId = session?.user?.personId
  const claimant = story.assignments[0]?.person ?? null
  const claimedByMe = !!myPersonId && claimant?.id === myPersonId
  const isElevated = hasElevatedAccess(session?.user?.appRole ?? "")
  const canDelete =
    session?.user?.id === story.createdByUserId || hasAdminAccess(session?.user?.appRole ?? "")

  async function post(url: string, body?: unknown) {
    const res = await fetch(apiPath(url), {
      method: "POST",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error ?? "Request failed")
    }
  }

  async function claim(personId: string, role: AssignmentRoleValue) {
    setWorking(true)
    try {
      await post(`/api/stories/${story.id}/claim`, { personId, role })
      toast.success("Claimed")
      setShowOtherPicker(false)
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim")
    } finally {
      setWorking(false)
    }
  }

  function claimForSelf() {
    if (!myPersonId) {
      toast.error(
        "You need a linked staff profile to claim a pitch yourself. Ask an admin to link one, or claim it for someone else."
      )
      return
    }
    claim(myPersonId, "REPORTER")
  }

  async function unclaim() {
    setWorking(true)
    try {
      await post(`/api/stories/${story.id}/unclaim`, claimedByMe ? undefined : { personId: claimant?.id })
      toast.success("Unclaimed")
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unclaim")
    } finally {
      setWorking(false)
    }
  }

  async function sendToBudget() {
    setWorking(true)
    try {
      await post(`/api/stories/${story.id}/send-to-budget`, {
        slug: slug.trim(),
        budgetLine: budgetLine.trim(),
      })
      toast.success("Sent to budget")
      setSendOpen(false)
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send to budget")
    } finally {
      setWorking(false)
    }
  }

  async function patchExpiry(expiresAt: string | null) {
    setWorking(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt, version: story.version }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (res.status === 409) {
          toast.error("This pitch was modified by another user. Reloading…")
          onUpdate()
          return
        }
        throw new Error(json?.error ?? "Failed to update")
      }
      toast.success(expiresAt ? "Expiry extended 30 days" : "Marked evergreen")
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Pitch deleted")
      router.push("/budget/pitches")
    } catch {
      toast.error("Failed to delete pitch. Please try again.")
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Pitch</Badge>
          {story.expiresAt ? (
            <PitchExpiryBadge expiresAt={story.expiresAt} />
          ) : (
            <Badge variant="outline">Evergreen</Badge>
          )}
        </div>
        <p className="text-lg leading-snug">{story.pitchText}</p>
        <p className="text-sm text-muted-foreground">
          Filed by {displayName(story.createdByUser?.name ?? "Unknown")} ·{" "}
          {formatTimestampPacific(story.pitchedAt ?? story.createdAt)}
          {claimant && <> · Claimed by {displayName(claimant.name)}</>}
        </p>
      </div>

      {/* Actions — kept up top and prominent; this is what the page is for.
          Left: the claim/expiry workflow (routine, reversible). Right: the
          "graduate this pitch" action and delete, set apart the same way
          StoryDetail's draft banner separates its own actions. */}
      {!readOnly && (
        <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!claimant && (
                <Button size="sm" className="gap-1" disabled={working} onClick={claimForSelf}>
                  <UserPlus className="size-3" />
                  Claim
                </Button>
              )}

              {!claimant && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={working}
                  onClick={() => setShowOtherPicker((v) => !v)}
                >
                  <UserPlus className="size-3" />
                  Claim for someone else
                </Button>
              )}

              {claimant && (claimedByMe || isElevated) && (
                <Button size="sm" variant="outline" className="gap-1" disabled={working} onClick={unclaim}>
                  <UserMinus className="size-3" />
                  Unclaim
                </Button>
              )}

              {story.expiresAt && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={working}
                    onClick={() => patchExpiry(addDays(new Date(), 30).toISOString())}
                  >
                    <CalendarPlus className="size-3" />
                    Extend 30 days
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1" disabled={working} onClick={() => patchExpiry(null)}>
                    <InfinityIcon className="size-3" />
                    Make evergreen
                  </Button>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Dialog open={sendOpen} onOpenChange={setSendOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant={claimant ? "default" : "outline"} className="gap-1">
                    <Send className="size-3" />
                    Send to Budget
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send to budget</DialogTitle>
                    <DialogDescription>
                      This pitch becomes a real story on the shared budget. Give it a real slug and
                      budget line before it goes live.
                      {!claimant && " Nobody's claimed it yet — it'll land unassigned, flagged the same way any unassigned budget item is."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pd-slug">Slug</Label>
                      <Input
                        id="pd-slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toUpperCase())}
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pd-budget">Budget Line</Label>
                      <textarea
                        id="pd-budget"
                        value={budgetLine}
                        onChange={(e) => setBudgetLine(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                    <Button onClick={sendToBudget} disabled={working || !slug.trim() || !budgetLine.trim()}>
                      {working ? "Sending..." : "Send to Budget"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {canDelete && (
                <DeleteDraftDialog slug={story.pitchText ?? story.slug} noun="pitch" disabled={deleting} onDelete={handleDelete} />
              )}
            </div>
          </div>

          {!claimant && showOtherPicker && (
            <div className="border-t pt-3">
              <PersonPicker
                label="Choose a person"
                onSelect={(person, role) => claim(person.id, role)}
              />
            </div>
          )}
        </div>
      )}

      {/* Contact & notes */}
      {story.notes && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact &amp; notes
          </p>
          <p className="text-sm whitespace-pre-wrap">{story.notes}</p>
          <p className="text-xs text-muted-foreground pt-1">
            Visible to any signed-in staffer while this is a pitch. Sending it to budget also
            emails this to everyone assigned.
          </p>
        </div>
      )}

      <Separator />

      <CommentSection
        storyId={story.id}
        comments={story.comments}
        onUpdate={onUpdate}
        hasAssignments={story.assignments.length > 0}
        readOnly={readOnly}
      />
    </div>
  )
}
