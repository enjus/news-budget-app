import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("budget")

export default function StoriesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
