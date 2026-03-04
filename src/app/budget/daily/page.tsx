import { redirect } from "next/navigation"
import { todayString } from "@/lib/utils"

export default function DailyPage() {
  redirect(`/budget/daily/${todayString()}`)
}
