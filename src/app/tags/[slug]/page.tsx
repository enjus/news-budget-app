import { Suspense } from "react"
import { tagSlugToKey } from "@/lib/tags"
import { TagView } from "./TagView"

// Reachable from tag chips on budget cards or by direct URL — deliberately no
// TopNav entry.
export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense>
        <TagView key={slug} tagKey={tagSlugToKey(slug)} />
      </Suspense>
    </div>
  )
}
