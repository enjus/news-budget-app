import { sectionMetadata } from "@/lib/nav"

export const metadata = sectionMetadata("pitches")

export default function PitchesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
