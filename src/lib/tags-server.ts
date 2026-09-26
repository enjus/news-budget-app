import { prisma } from "@/lib/prisma"
import { DEFAULT_TAGS } from "@/lib/tags"

/**
 * Insert any DEFAULT_TAGS rows that don't exist yet. Called from the tag read
 * routes so every environment self-heals after `prisma db push` — the VPS
 * deploy, Vercel previews, and fresh local DBs all get the six original tags
 * without a separate seed step. Checks per key (not "table is empty") so an
 * admin creating a tag first on a fresh DB doesn't suppress the defaults.
 * Safe because Tag rows are only ever archived, never deleted.
 */
export async function ensureDefaultTags(): Promise<void> {
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
