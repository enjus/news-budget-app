/**
 * LinkCategory.nameKey: the name lowercased with whitespace collapsed. Its
 * unique index is what makes category names case-insensitively unique, so
 * "Wire" and "wire " can't both exist even when created concurrently.
 */
export function categoryNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * For the reorder routes: given the client's full ordered id list and the
 * rows as they are now, returns the updates needed — only rows whose position
 * actually changed, so a one-step move writes two rows, not the whole list.
 * Returns null when `ids` isn't exactly the current set (something was added,
 * removed or moved elsewhere since the client loaded).
 */
export function reorderUpdates(
  ids: string[],
  current: { id: string; sortOrder: number }[]
): { id: string; sortOrder: number }[] | null {
  const set = new Set(ids)
  if (set.size !== ids.length || ids.length !== current.length || !current.every((r) => set.has(r.id))) {
    return null
  }
  const before = new Map(current.map((r) => [r.id, r.sortOrder]))
  return ids.map((id, i) => ({ id, sortOrder: i })).filter((r) => before.get(r.id) !== r.sortOrder)
}
