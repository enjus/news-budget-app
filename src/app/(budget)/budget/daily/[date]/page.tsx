import { DailyBudgetView } from "./DailyBudgetView"

interface DailyBudgetPageProps {
  params: Promise<{ date: string }>
}

export default async function DailyBudgetPage({ params }: DailyBudgetPageProps) {
  const { date } = await params

  return <DailyBudgetView date={date} />
}
