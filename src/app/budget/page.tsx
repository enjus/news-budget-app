import { redirect } from "next/navigation"
import { todayString } from "@/lib/utils"

export default function BudgetPage() {
  redirect(`/budget/daily/${todayString()}`)
}
