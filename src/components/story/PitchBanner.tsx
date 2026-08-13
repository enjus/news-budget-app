"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Send, UserMinus, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PitchExpiryBadge } from "@/components/budget/PitchExpiryBadge"
import { apiPath } from "@/lib/api-path"
import { hasElevatedAccess } from "@/lib/utils"
import type { StoryWithRelations } from "@/types/index"

interface PitchBannerProps {
  story: StoryWithRelations
  onUpdate: () => void
}

/** Banner shown on a pitch's story detail page in place of the private-draft
 *  banner (a pitch is visible to everyone, so that banner's copy is wrong for
 *  it). Trusts the button labels — no explanatory copy around claim vs. send
 *  to budget, per direct feedback that the two-step distinction already reads
 *  as intuitive. */
export function PitchBanner({ story, onUpdate }: PitchBannerProps) {
  const { data: session } = useSession()
  const [working, setWorking] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [slug, setSlug] = useState(story.slug)
  const [budgetLine, setBudgetLine] = useState(story.budgetLine)

  const myPersonId = session?.user?.personId
  const claimedByMe = !!myPersonId && story.assignments.some((a) => a.personId === myPersonId)
  const isElevated = hasElevatedAccess(session?.user?.appRole ?? "")
  const hasClaimant = story.assignments.length > 0

  async function claim() {
    if (!myPersonId) {
      toast.error("You need a linked staff profile to claim a pitch. Ask an admin to link one.")
      return
    }
    setWorking(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}/claim`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: myPersonId, role: "REPORTER" }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? "Failed to claim")
      }
      toast.success("Claimed")
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim")
    } finally {
      setWorking(false)
    }
  }

  async function unclaim(personId?: string) {
    setWorking(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${story.id}/unclaim`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personId ? { personId } : {}),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? "Failed to unclaim")
      }
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
      const res = await fetch(apiPath(`/api/stories/${story.id}/send-to-budget`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), budgetLine: budgetLine.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? "Failed to send to budget")
      }
      toast.success("Sent to budget")
      setSendOpen(false)
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send to budget")
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Pitched by {story.createdByUser?.name ?? "Unknown"}
            {hasClaimant && (
              <> · Claimed by {story.assignments.map((a) => a.person.name).join(", ")}</>
            )}
          </p>
          {story.pitchText && (
            <p className="text-sm italic text-muted-foreground">&ldquo;{story.pitchText}&rdquo;</p>
          )}
          <PitchExpiryBadge expiresAt={story.expiresAt} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!hasClaimant && (
            <Button size="sm" className="gap-1" disabled={working} onClick={claim}>
              <UserPlus className="size-3" />
              Claim
            </Button>
          )}

          {hasClaimant && claimedByMe && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={working}
              onClick={() => unclaim()}
            >
              <UserMinus className="size-3" />
              Unclaim
            </Button>
          )}

          {/* Elevated users removing someone else's claim: one button per
              claimant, since with multiple claimants a single generic button
              can't say which one it would remove. */}
          {isElevated &&
            story.assignments
              .filter((a) => a.personId !== myPersonId)
              .map((a) => (
                <Button
                  key={a.personId}
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={working}
                  onClick={() => unclaim(a.personId)}
                >
                  <UserMinus className="size-3" />
                  Unclaim {a.person.name}
                </Button>
              ))}

          {hasClaimant && (
            <Dialog open={sendOpen} onOpenChange={setSendOpen}>
              <Button size="sm" className="gap-1" onClick={() => setSendOpen(true)}>
                <Send className="size-3" />
                Send to Budget
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send to budget</DialogTitle>
                  <DialogDescription>
                    This pitch becomes a real story on the shared budget. Give it a real slug and
                    budget line before it goes live.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pb-slug">Slug</Label>
                    <Input
                      id="pb-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toUpperCase())}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pb-budget">Budget Line</Label>
                    <textarea
                      id="pb-budget"
                      value={budgetLine}
                      onChange={(e) => setBudgetLine(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                  <Button
                    onClick={sendToBudget}
                    disabled={working || !slug.trim() || !budgetLine.trim()}
                  >
                    {working ? "Sending..." : "Send to Budget"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  )
}
