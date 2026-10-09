import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// /budget applies the user's defaultView preference.
export default function RootPage() {
  redirect("/budget")
}
