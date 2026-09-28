"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { isTabActive } from "@/lib/nav"
import { useNav } from "@/lib/hooks/useNav"

// Sub-nav for whichever section (Budget, Schedule, …) owns the current path.
// Desktop only — on mobile the same tabs are grouped in TopNav's hamburger
// menu. Not sticky: CommentSection's scroll-mt assumes only the h-14 TopNav
// is pinned.
export function SectionTabNav() {
  const { pathname, current } = useNav()
  if (!current || current.tabs.length === 0) return null

  return (
    <div className="hidden border-b bg-background md:block">
      <div className="mx-auto max-w-7xl px-4">
        <nav className="flex gap-0" aria-label={`${current.label} sections`}>
          {current.tabs.map((tab) => {
            const isActive = isTabActive(pathname, tab)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
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
