"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn, todayString } from "@/lib/utils"

const tabs = [
  { label: "Daily", href: `/budget/daily/${todayString()}`, matchPrefix: "/budget/daily" },
  { label: "Daily Edition", href: "/budget/edition", matchPrefix: "/budget/edition" },
  { label: "Enterprise", href: "/budget/enterprise", matchPrefix: "/budget/enterprise" },
  { label: "Shelved", href: "/budget/shelved", matchPrefix: "/budget/shelved" },
]

export function BudgetTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-background">
      <div className="mx-auto max-w-7xl px-4">
        <nav className="flex gap-0" aria-label="Budget sections">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.matchPrefix)
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
