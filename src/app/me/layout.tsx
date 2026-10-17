import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("budget")

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
