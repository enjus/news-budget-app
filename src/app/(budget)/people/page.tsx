import { redirect } from "next/navigation"

// The people list was retired in favor of the roster (issue #102). Record
// management lives in /admin/people; /people/[id] stays as the workload view.
export default function PeoplePage() {
  redirect("/roster")
}
