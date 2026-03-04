import { redirect } from "next/navigation"
import { todayString } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default function BudgetPage() {
  redirect(`/budget/daily/${todayString()}`)
}
