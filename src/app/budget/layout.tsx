import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("budget")

export default function BudgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {children}
    </div>
  )
}
