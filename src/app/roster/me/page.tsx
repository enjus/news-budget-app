import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { RosterProfileView } from "../[id]/RosterProfileView"

// Your own roster profile at a stable URL, like /me and /schedule/me. Renders
// in place rather than redirecting to /roster/[id]. This static segment wins
// over [id], so no Person id can collide with it (ids are cuids).
export default async function MyRosterProfilePage() {
  const session = await getServerSession(authOptions)
  const personId = session?.user?.personId

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {personId ? (
        <RosterProfileView id={personId} />
      ) : (
        <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
          <p>Your account isn&apos;t linked to a roster entry — ask an admin to link it.</p>
          <Link href="/roster" className="hover:text-foreground hover:underline">
            Back to the roster
          </Link>
        </div>
      )}
    </div>
  )
}
