"use client"

import { useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PitchRow } from "@/components/budget/PitchRow"
import { usePitches } from "@/lib/hooks/usePitches"
import { apiPath } from "@/lib/api-path"
import type { PitchListItem } from "@/types"

export function PitchesView() {
  const { pitches, isLoading, mutate } = usePitches()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const currentPersonId = session?.user?.personId
  const [query, setQuery] = useState("")
  const [mineOnly, setMineOnly] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pitches.filter((p) => {
      if (mineOnly) {
        // "Mine" = pitches I filed, or pitches I've claimed — either counts as
        // mine, since claiming (not filing) is how most pitches end up "yours".
        const filedByMe = p.createdByUser?.id === currentUserId
        const claimedByMe = p.assignments.some((a) => a.person.id === currentPersonId)
        if (!filedByMe && !claimedByMe) return false
      }
      if (q && !p.pitchText?.toLowerCase().includes(q)) return false
      return true
    })
  }, [pitches, query, mineOnly, currentUserId, currentPersonId])

  const claimed = filtered.filter((p) => p.assignments.length > 0)
    .sort((a, b) => compareExpiry(a.expiresAt, b.expiresAt))
  const unclaimed = filtered.filter((p) => p.assignments.length === 0)
  const expiring = unclaimed.filter((p) => p.expiresAt)
    .sort((a, b) => compareExpiry(a.expiresAt, b.expiresAt))
  const evergreen = unclaimed.filter((p) => !p.expiresAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Pitches</h1>
          <p className="text-sm text-muted-foreground">
            Story ideas nobody owns yet. Visible to everyone until claimed and sent to budget.
          </p>
        </div>
        <FilePitchDialog onFiled={() => mutate()} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pitches"
          className="max-w-xs text-base"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} />
          Mine
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <PitchSection
            title="Expiring"
            emptyText="No expiring pitches."
            items={expiring}
            onUpdate={mutate}
          />
          <PitchSection
            title="Evergreen"
            emptyText="No evergreen pitches."
            items={evergreen}
            onUpdate={mutate}
          />
          <PitchSection
            title="Claimed"
            emptyText="Nobody has claimed a pitch yet."
            items={claimed}
            onUpdate={mutate}
            deemphasized
          />
        </div>
      )}
    </div>
  )
}

function compareExpiry(a: string | Date | null, b: string | Date | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return new Date(a).getTime() - new Date(b).getTime()
}

function PitchSection({
  title,
  emptyText,
  items,
  onUpdate,
  deemphasized,
}: {
  title: string
  emptyText: string
  items: PitchListItem[]
  onUpdate: () => void
  deemphasized?: boolean
}) {
  return (
    <section className={`space-y-2 ${deemphasized ? "opacity-80" : ""}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </section>
  )
}

function FilePitchDialog({ onFiled }: { onFiled: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [notes, setNotes] = useState("")
  const [evergreen, setEvergreen] = useState(false)
  // Blank = let the server default to 30 days out (see /api/pitches).
  const [expiresAt, setExpiresAt] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(apiPath("/api/pitches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          notes: notes.trim() || null,
          evergreen,
          // Parse as UTC midnight, not local midnight — pub/expiry dates in
          // this app are newsroom time encoded as UTC (see CLAUDE.md), and
          // parsing the bare "T00:00:00" as local time rolls the date back
          // a day for anyone east of UTC.
          expiresAt: !evergreen && expiresAt ? new Date(expiresAt + "T00:00:00.000Z").toISOString() : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to file pitch")
      }
      toast.success("Pitch filed")
      setText("")
      setNotes("")
      setEvergreen(false)
      setExpiresAt("")
      setOpen(false)
      onFiled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to file pitch")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="size-4" />
          File a pitch
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File a pitch</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pitch-text">Pitch</Label>
            <textarea
              id="pitch-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="A caller says there's a pattern of unpermitted demolitions on the east side..."
              className="w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pitch-notes">Contact &amp; notes (optional)</Label>
            <textarea
              id="pitch-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Caller's name, number, anything else worth knowing"
              className="w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Shelf life</Label>
            {!evergreen && (
              <>
                <Input
                  id="pitch-expires"
                  type="date"
                  aria-label="Expires on (optional)"
                  className="w-auto text-base"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to 30 days out if left blank. Extended automatically once claimed and sent to budget.
                </p>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={evergreen} onCheckedChange={(v) => setEvergreen(v === true)} />
              Evergreen — good any time, doesn&apos;t expire
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !text.trim()}>
            {submitting ? "Filing..." : "File pitch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
