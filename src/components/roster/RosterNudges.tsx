"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useRosterStatus } from "@/lib/hooks/useRoster"
import { apiPath } from "@/lib/api-path"

type NudgeKind = "review" | "map"

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
const snoozeKey = (kind: NudgeKind) => `roster-nudge-snooze-${kind}`

// "Not now" is a per-browser convenience; the nudge itself lives on the server.
function isSnoozed(kind: NudgeKind): boolean {
  try {
    return Number(localStorage.getItem(snoozeKey(kind))) > Date.now()
  } catch {
    return false
  }
}

function saveSnooze(kind: NudgeKind) {
  try {
    localStorage.setItem(snoozeKey(kind), String(Date.now() + SNOOZE_MS))
  } catch {
    // Storage blocked: the nudge just comes back on the next page load.
  }
}

/** Sitewide prompts for the signed-in user: review your roster profile every
 *  six months, and re-add yourself to the map after an address change cleared
 *  your pin. */
export function RosterNudges() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { status, mutate } = useRosterStatus(!!session?.user)
  const [hidden, setHidden] = useState<NudgeKind[]>([])
  const [busy, setBusy] = useState(false)

  if (!status) return null

  const showing = (kind: NudgeKind) => !hidden.includes(kind) && !isSnoozed(kind)

  function snooze(kind: NudgeKind) {
    saveSnooze(kind)
    setHidden((h) => [...h, kind])
  }

  async function send(url: string, method: "POST" | "DELETE") {
    setBusy(true)
    try {
      const res = await fetch(apiPath(url), { method })
      if (!res.ok) throw new Error()
      await mutate()
    } catch {
      toast.error("Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const showMap = status.mapResetPending && showing("map") && !!session?.user?.personId
  const showReview = status.reviewDue && showing("review")
  if (!showMap && !showReview) return null

  return (
    <div className="border-b bg-muted/50 text-sm">
      {showMap && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <p>
            Your home address changed, so your pin came off the roster map.
            {pathname === "/roster/map" && " Use “Add me” to place it again."}
          </p>
          <div className="flex flex-wrap gap-2">
            {pathname !== "/roster/map" && (
              <Button size="sm" asChild>
                <Link href="/roster/map">Add me back</Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => send(`/api/roster/${session?.user?.personId}/location`, "DELETE")}
            >
              Stay off the map
            </Button>
            <Button size="sm" variant="ghost" onClick={() => snooze("map")}>
              Not now
            </Button>
          </div>
        </div>
      )}
      {showReview && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <p>Is your roster profile up to date? Please check it every six months.</p>
          <div className="flex flex-wrap gap-2">
            {pathname !== "/roster/me" && (
              <Button size="sm" asChild>
                <Link href="/roster/me">Review my profile</Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => send("/api/roster/me/reviewed", "POST")}
            >
              Still accurate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => snooze("review")}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
