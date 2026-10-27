import { RosterMapView } from "./RosterMapView"

// Open to every signed-in user, like the rest of the roster. Linked from
// /roster only — no nav entry, and nothing outside the roster points here.
export default function RosterMapPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <RosterMapView />
    </div>
  )
}
