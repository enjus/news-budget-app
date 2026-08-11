import { apiPath } from "@/lib/api-path"

/**
 * POST a batch of child records after a parent (story/video) already exists,
 * returning how many failed. The parent is already saved by the time this
 * runs, so a failure can't be reported as "creation failed" — the caller has
 * to name what didn't attach. Previously each form had its own bare
 * Promise.all call that ignored res.ok entirely, so a rejected assignment
 * vanished behind a "Story/Video created" toast. Shared by StoryForm and
 * VideoForm so the fix can't land in one and be missed in the other.
 */
export async function postAll(url: string, bodies: unknown[]): Promise<number> {
  const results = await Promise.allSettled(
    bodies.map(async (body) => {
      const res = await fetch(apiPath(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
  )
  return results.filter((r) => r.status === "rejected").length
}
