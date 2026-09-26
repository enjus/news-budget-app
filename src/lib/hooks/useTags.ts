import { useMemo } from "react"
import useSWR from "swr"

/** A Tag row as returned by /api/tags (dates serialized). */
export interface TagRecord {
  key: string
  label: string
  abbrev: string | null
  color: string
  icon: string | null
  sortOrder: number
  archivedAt: string | null
}

/**
 * All admin-managed tags. `tags` includes archived ones (cards still render
 * them); `activeTags` is what pickers should offer.
 *
 * Like every SWR hook here, the lists are empty while loading — check
 * `isLoading` before treating a missing key as "doesn't exist".
 */
export function useTags() {
  const { data, isLoading, error, mutate } = useSWR<{ tags: TagRecord[] }>("/api/tags")

  const tags = useMemo(() => data?.tags ?? [], [data])
  const activeTags = useMemo(() => tags.filter((t) => !t.archivedAt), [tags])
  const tagByKey = useMemo(() => new Map(tags.map((t) => [t.key, t])), [tags])

  return { tags, activeTags, tagByKey, isLoading, error, mutate }
}
