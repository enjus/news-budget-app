import { prisma } from "@/lib/prisma"
import { DEFAULT_TAGS, labelToTagKey } from "@/lib/tags"

let defaultsEnsured: Promise<void> | null = null

/**
 * Insert any DEFAULT_TAGS rows that don't exist yet. Called from the tag read
 * routes so every environment self-heals after `prisma db push` — the VPS
 * deploy, Vercel previews, and fresh local DBs all get the six original tags
 * without a separate seed step. Checks per key (not "table is empty") so an
 * admin creating a tag first on a fresh DB doesn't suppress the defaults.
 * Safe because Tag rows are only ever archived, never deleted.
 *
 * Memoized per server process: once it has succeeded there's nothing left to
 * do, so later calls skip the query. A failure clears the memo to retry.
 */
export function ensureDefaultTags(): Promise<void> {
  defaultsEnsured ??= insertMissingDefaults().catch((error) => {
    defaultsEnsured = null
    throw error
  })
  return defaultsEnsured
}

async function insertMissingDefaults(): Promise<void> {
  const existing = await prisma.tag.findMany({
    where: { key: { in: DEFAULT_TAGS.map((t) => t.key) } },
    select: { key: true },
  })
  if (existing.length === DEFAULT_TAGS.length) return
  const have = new Set(existing.map((t) => t.key))
  await prisma.tag.createMany({
    data: DEFAULT_TAGS.filter((t) => !have.has(t.key)),
    skipDuplicates: true,
  })
}

/**
 * The tag (other than `excludeKey`) that `label` would be indistinguishable
 * from: one whose key, or whose own label, normalizes to the same key. The DB
 * label constraint is case-sensitive and a rename keeps its original key, so
 * neither the key nor the label unique index catches "pushed" vs "Pushed" or a
 * new tag named like a renamed one. Tags are few, so compare in memory.
 */
export async function findTagNameConflict(label: string, excludeKey?: string) {
  const want = labelToTagKey(label)
  const tags = await prisma.tag.findMany({
    select: { key: true, label: true, archivedAt: true },
  })
  return tags.find(
    (t) => t.key !== excludeKey && (t.key === want || labelToTagKey(t.label) === want)
  ) ?? null
}
