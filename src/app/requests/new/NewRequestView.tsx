"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { VisualRequestForm } from "@/components/story/VisualRequestForm"

/**
 * File a standalone request: one with no story yet ("update our file photos
 * of the governor"). It can be attached to a story later from its request
 * page. Requests for an existing story are filed from that story's page.
 */
export function NewRequestView() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Requests
      </Link>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">New visual request</h1>
        <p className="text-sm text-muted-foreground">
          For work that isn&apos;t tied to a story yet. You can attach it to a story later. If the story already
          exists, request the visual from the story&apos;s page instead.
        </p>
      </div>

      <VisualRequestForm
        onSubmitted={(visual) => router.push(visual.id ? `/requests/${visual.id}` : "/requests")}
        onCancel={() => router.push("/requests")}
      />
    </div>
  )
}
