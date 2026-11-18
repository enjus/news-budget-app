"use client"

import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { RequestDetail } from "@/components/visuals/RequestDetail"
import { useVisualRequest } from "@/lib/hooks/useVisualRequest"

/** Loads one request (polled) and handles the loading and not-found states. */
export function RequestDetailWrapper({ id }: { id: string }) {
  const { request, isLoading, notFound, error, mutate } = useVisualRequest(id)

  if (notFound) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Request not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. <Link href="/requests" className="underline underline-offset-4">Back to requests</Link>
        </p>
      </div>
    )
  }

  if (!request) {
    if (error && !isLoading) {
      return <p className="text-sm text-destructive">Couldn&apos;t load this request. Try reloading the page.</p>
    }
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  return <RequestDetail request={request} onUpdate={() => mutate()} />
}
