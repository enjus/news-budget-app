import { ScheduleTabNav } from "@/components/schedule/ScheduleTabNav"

export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <ScheduleTabNav />
      {children}
    </div>
  )
}
