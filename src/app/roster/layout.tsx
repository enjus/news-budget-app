import type { Metadata } from "next"

// /roster isn't a nav section (it's reached from the account menu), so it
// sets its own browser-tab title in the same "Newsroom | <Name>" form that
// sectionMetadata() gives sections. Covers /roster, /roster/[id],
// /roster/map and /roster/me.
export const metadata: Metadata = { title: { absolute: "Newsroom | Roster" } }

export default function RosterLayout({ children }: { children: React.ReactNode }) {
  return children
}
