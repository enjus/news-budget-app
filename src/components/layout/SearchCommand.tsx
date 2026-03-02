"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, FileText, Video, X, User } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn, STORY_STATUS_LABELS } from "@/lib/utils"
import { usePeople } from "@/lib/hooks/usePeople"
import type { SearchResult } from "@/app/api/search/route"

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function ResultDate({ result }: { result: SearchResult }) {
  if (result.onlinePubDateTBD || !result.onlinePubDate) {
    return <span className="text-xs text-muted-foreground">TBD</span>
  }
  const d = new Date(result.onlinePubDate)
  const days = result.daysFromToday ?? 0
  const isPast = d < new Date()
  const label = days < 1
    ? "Today"
    : isPast
      ? `${Math.round(days)}d ago`
      : `${Math.round(days)}d away`
  return (
    <span className="text-xs text-muted-foreground" title={format(d, "MMM d, yyyy h:mm a")}>
      {format(d, "MMM d")} · {label}
    </span>
  )
}

export function SearchCommand() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [authorId, setAuthorId] = useState<string | null>(null)
  const [authorPickerOpen, setAuthorPickerOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { people } = usePeople()

  const debouncedQuery = useDebounce(query, 200)

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery("")
      setResults([])
    }
  }, [open])

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery && !authorId) {
      setResults([])
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set("q", debouncedQuery)
    if (authorId) params.set("authorId", authorId)

    fetch(`/api/search?${params}`)
      .then((r) => r.json())
      .then((data) => setResults(data.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery, authorId])

  const navigate = useCallback(
    (result: SearchResult) => {
      setOpen(false)
      router.push(result.type === "story" ? `/stories/${result.id}` : `/videos/${result.id}`)
    },
    [router]
  )

  const selectedAuthor = people.find((p) => p.id === authorId)

  return (
    <>
      {/* Trigger button */}
      {/* Mobile: icon-only button */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="sm:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="size-4" />
      </Button>

      {/* Desktop: full pill button */}
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex gap-2 text-muted-foreground w-36 justify-start"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="text-xs">Search</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1 py-0.5 text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" aria-describedby={undefined}>
          {/* Search input row */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stories and videos…"
              className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            {/* Author filter */}
            <Popover open={authorPickerOpen} onOpenChange={setAuthorPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={authorId ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("gap-1 h-7 px-2 text-xs shrink-0", !authorId && "text-muted-foreground")}
                >
                  <User className="size-3" />
                  {selectedAuthor ? selectedAuthor.name.split(" ")[0] : "Author"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Find author…" />
                  <CommandList>
                    <CommandEmpty>No people found.</CommandEmpty>
                    <CommandGroup>
                      {authorId && (
                        <CommandItem onSelect={() => { setAuthorId(null); setAuthorPickerOpen(false) }}>
                          <X className="mr-2 size-3" />
                          Clear filter
                        </CommandItem>
                      )}
                      {people.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => { setAuthorId(p.id); setAuthorPickerOpen(false) }}
                        >
                          <span className={cn("size-4 mr-2 rounded-full flex items-center justify-center text-[10px] bg-secondary", authorId === p.id && "ring-2 ring-primary")} />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {(query || authorId) && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => { setQuery(""); setAuthorId(null) }}
                className="text-muted-foreground"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
            )}

            {!loading && (query || authorId) && results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
            )}

            {!loading && results.length === 0 && !query && !authorId && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Type to search, or filter by author.
              </p>
            )}

            {!loading && results.length > 0 && (
              <ul className="py-1">
                {results.map((result) => (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      onClick={() => navigate(result)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none"
                    >
                      {/* Icon */}
                      <span className="mt-0.5 shrink-0 text-muted-foreground">
                        {result.type === "story"
                          ? <FileText className="size-4" />
                          : <Video className="size-4" />}
                      </span>

                      {/* Text */}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{result.slug}</span>
                          {result.status !== "DRAFT" && (
                            <span className="rounded bg-secondary px-1 py-0.5 text-[10px] font-medium text-secondary-foreground">
                              {STORY_STATUS_LABELS[result.status] ?? result.status}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.budgetLine}
                        </span>
                      </span>

                      {/* Date */}
                      <ResultDate result={result} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
