"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { usePeople } from "@/lib/hooks/usePeople"
import type { Person } from "@/types/index"

interface MentionTextareaProps {
  value: string
  /** Person ids currently tagged in the body. */
  mentionIds: string[]
  onChange: (value: string, mentionIds: string[]) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  "aria-label"?: string
}

/** The partial "@..." token immediately before the caret, if any. */
interface MentionQuery {
  /** Index of the "@" in the value. */
  start: number
  /** Text typed after the "@". */
  text: string
}

// An @-token may span one space, so "@Alice Chen" keeps matching after the space.
// The query must start with a non-space character (or be empty, right after the
// "@"): otherwise "Ping me @ 3pm" reads as a mention of " 3pm", and a query of
// just " " matches every staff name — every one contains a space.
const MENTION_QUERY_RE = /(?:^|\s)@((?:[^\s@]+(?: [^\s@]*)?)?)$/

function detectMentionQuery(value: string, caret: number): MentionQuery | null {
  const match = MENTION_QUERY_RE.exec(value.slice(0, caret))
  if (!match) return null
  return { start: caret - match[1].length - 1, text: match[1] }
}

const MAX_SUGGESTIONS = 8

/**
 * Textarea with @-mention autocomplete. The body keeps the literal "@Full Name"
 * text; the caller sends the resolved person ids to the API alongside it.
 */
export function MentionTextarea({
  value,
  mentionIds,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: MentionTextareaProps) {
  const { people, isLoading: peopleLoading } = usePeople()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)

  const [query, setQuery] = useState<MentionQuery | null>(null)
  const [highlighted, setHighlighted] = useState(0)

  // Restore the caret after a programmatic value change (mention insertion).
  useEffect(() => {
    if (pendingCaret.current === null) return
    const caret = pendingCaret.current
    pendingCaret.current = null
    textareaRef.current?.focus()
    textareaRef.current?.setSelectionRange(caret, caret)
  }, [value])

  const suggestions: Person[] = query
    ? people
        .filter((p) => p.name.toLowerCase().includes(query.text.toLowerCase()))
        .slice(0, MAX_SUGGESTIONS)
    : []

  /**
   * Drop tags whose "@Name" text is no longer in the body. While the people
   * list is still loading, every lookup would miss and strip all mentions —
   * so skip pruning until it's ready rather than treating "not found yet" as
   * "removed".
   */
  function pruneMentions(text: string, ids: string[]): string[] {
    if (peopleLoading) return ids
    return ids.filter((id) => {
      const person = people.find((p) => p.id === id)
      return person ? text.includes(`@${person.name}`) : false
    })
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setQuery(detectMentionQuery(next, e.target.selectionStart))
    setHighlighted(0)
    onChange(next, pruneMentions(next, mentionIds))
  }

  function syncQueryToCaret() {
    const el = textareaRef.current
    if (!el) return
    setQuery(detectMentionQuery(el.value, el.selectionStart))
  }

  function selectPerson(person: Person) {
    const el = textareaRef.current
    if (!el || !query) return

    const caret = el.selectionStart
    const inserted = `@${person.name} `
    const next = value.slice(0, query.start) + inserted + value.slice(caret)

    pendingCaret.current = query.start + inserted.length
    setQuery(null)
    setHighlighted(0)
    onChange(next, [...new Set([...mentionIds, person.id])])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!query || suggestions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      selectPerson(suggestions[highlighted])
    } else if (e.key === "Escape") {
      e.preventDefault()
      setQuery(null)
    }
  }

  const listboxId = "mention-suggestions"

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={syncQueryToCaret}
        onKeyUp={syncQueryToCaret}
        onBlur={() => setQuery(null)}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        // text-base (not text-sm) — iOS Safari zooms on focus below 16px.
        className={cn(
          "w-full resize-y rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />

      {suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-[min(280px,calc(100vw-2rem))] overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((person, i) => (
            <li key={person.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                // onMouseDown, not onClick — onBlur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectPerson(person)
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left",
                  i === highlighted && "bg-accent text-accent-foreground"
                )}
              >
                <span className="text-sm">{person.name}</span>
                <span className="text-xs text-muted-foreground">{person.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
