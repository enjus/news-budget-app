import { BudgetTabNav } from "@/components/layout/BudgetTabNav"

export default function BudgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <BudgetTabNav />
      <div className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </div>
    </div>
  )
}
