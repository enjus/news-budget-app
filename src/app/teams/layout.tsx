import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("budget")

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
