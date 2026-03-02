import { redirect } from "next/navigation"
import { format } from "date-fns"

export default function BudgetPage() {
  redirect(`/budget/daily/${format(new Date(), "yyyy-MM-dd")}`)
}
