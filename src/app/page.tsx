import { redirect } from "next/navigation"
import { todayString } from "@/lib/utils"

export default function HomePage() {
  redirect(`/budget/daily/${todayString()}`)
}
