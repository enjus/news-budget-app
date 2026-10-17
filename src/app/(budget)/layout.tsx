import { sectionMetadata } from "@/lib/nav"

// Route group for every route nav.ts assigns to Budget (/budget, /teams, /me,
// /people, /stories, /videos, /tags), so they share one tab title. The group
// name isn't part of the URL.
export const metadata = sectionMetadata("budget")

export default function BudgetSectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
