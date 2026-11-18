"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { apiPath } from "@/lib/api-path"
import type { SearchResult } from "@/app/api/search/route"

interface AttachStoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The story the request is on now, left out of the results; null when unplaced. */
  currentStoryId: string | null
  /** Resolves when the PATCH finishes; the dialog closes on true. */
  onPick: (story: { id: string; slug: string }) => Promise<boolean>
}

/**
 * Story picker for "Attach to story" / "Move to another story": a search box
 * over GET /api/search, stories only. That endpoint already leaves out shelved
 * stories (the PATCH refuses them too) and includes pitches, and only covers
 * the ±90-day window around today plus TBD, like the global search.
 */
export function AttachStoryDialog({ open, onOpenChange, currentStoryId, onPick }: AttachStoryDialogProps) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const shouldSearch = debounced.length >= 2

  useEffect(() => {
    if (!open || !shouldSearch) return
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const r = await fetch(apiPath(`/api/search?${new URLSearchParams({ q: debounced })}`))
        const data = await r.json()
        if (!cancelled) setResults((data.results ?? []) as SearchResult[])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [debounced, open, shouldSearch])

  const stories = shouldSearch ? results.filter((r) => r.type === "story" && r.id !== currentStoryId) : []

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("")
      setDebounced("")
      setResults([])
    }
    onOpenChange(next)
  }

  async function pick(story: SearchResult) {
    setPicking(story.id)
    try {
      if (await onPick({ id: story.id, slug: story.slug })) handleOpenChange(false)
    } finally {
      setPicking(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{currentStoryId ? "Move to another story" : "Attach to a story"}</DialogTitle>
          <DialogDescription>Search by slug or budget line.</DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          autoComplete="off"
          placeholder="Search stories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {!shouldSearch ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Type at least two characters.</p>
          ) : loading && stories.length === 0 ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </p>
          ) : stories.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">No stories match.</p>
          ) : (
            stories.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={picking !== null}
                onClick={() => pick(s)}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
              >
                <span className="block text-sm font-medium">
                  {s.slug}
                  {s.isPitch && <span className="ml-2 text-xs font-normal text-muted-foreground">Pitch</span>}
                  {picking === s.id && <Loader2 className="ml-2 inline size-3 animate-spin" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{s.budgetLine}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
