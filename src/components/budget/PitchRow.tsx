"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { useState } from "react"
import { toast } from "sonner"
import { Send, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PitchExpiryBadge } from "@/components/budget/PitchExpiryBadge"
import { apiPath } from "@/lib/api-path"
import type { PitchListItem } from "@/types"

/** A lighter row for a pool item — no time, no visuals, no status chip worth
 *  showing. Shared by the pool page (/budget/pitches) and /me's pitch sections
 *  so claim/unclaim behave identically everywhere. Full role selection / claiming
 *  for someone else lives on the story detail page's PitchBanner. */
export function PitchRow({ pitch, onUpdate }: { pitch: PitchListItem; onUpdate: () => void }) {
  const { data: session } = useSession()
  const [working, setWorking] = useState(false)
  const claimant = pitch.assignments[0]?.person

  async function claim() {
    if (!session?.user?.personId) {
      toast.error("You need a linked staff profile to claim a pitch. Ask an admin to link one.")
      return
    }
    setWorking(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${pitch.id}/claim`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: session.user.personId, role: "REPORTER" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to claim")
      }
      toast.success("Claimed")
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim")
    } finally {
      setWorking(false)
    }
  }

  async function unclaim() {
    setWorking(true)
    try {
      const res = await fetch(apiPath(`/api/stories/${pitch.id}/unclaim`), { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to unclaim")
      }
      toast.success("Unclaimed")
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unclaim")
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
      <Link href={`/stories/${pitch.id}`} className="min-w-0 flex-1 hover:underline">
        <p className="text-sm">{pitch.pitchText}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Pitched by {pitch.createdByUser?.name ?? "Unknown"}</span>
          {claimant && <span>· Claimed by {claimant.name}</span>}
          <PitchExpiryBadge expiresAt={pitch.expiresAt} />
        </div>
      </Link>

      {claimant ? (
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/stories/${pitch.id}`}>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Send className="size-3" />
              Send to budget
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={working} onClick={unclaim}>
            <UserMinus className="size-3" />
            Unclaim
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" disabled={working} onClick={claim}>
          Claim
        </Button>
      )}
    </div>
  )
}
