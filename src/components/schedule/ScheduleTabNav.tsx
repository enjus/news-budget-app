"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Today", href: "/schedule/today" },
  { label: "Me", href: "/schedule/me" },
  { label: "Teams", href: "/schedule/teams" },
  { label: "Shifts", href: "/schedule/shifts" },
]

// Sub-nav for the staffing schedule system (issue #19). Not surfaced in
// TopNav — every /schedule/* route is still reachable only by direct URL
// (see docs/staffing-schedule.md) — but once someone is inside one of these
// views, this bar lets them move between the others without hand-editing
// the URL.
export function ScheduleTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-background">
      <div className="mx-auto max-w-7xl px-4">
        <nav className="flex gap-0" aria-label="Schedule sections">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative -mb-px inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
