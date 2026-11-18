import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("requests")

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
