import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { canCreateContent } from "@/lib/utils"
import { VideoFormWrapper } from "./VideoFormWrapper"

export default async function NewVideoPage() {
  const session = await getServerSession(authOptions)
  if (!session || !canCreateContent(session.user.appRole)) {
    redirect("/budget/daily")
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">New Video</h1>
      <Suspense>
        <VideoFormWrapper />
      </Suspense>
    </div>
  )
}
