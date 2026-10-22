import { RosterView } from "./RosterView"

// Open to every signed-in user (middleware already requires a session).
// Reached from the account menu, not the section nav — see AccountLinks in TopNav.
export default function RosterPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <RosterView />
    </div>
  )
}
