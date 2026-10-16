import { RosterProfileView } from "./RosterProfileView"

export default async function RosterProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <RosterProfileView id={id} />
    </div>
  )
}
