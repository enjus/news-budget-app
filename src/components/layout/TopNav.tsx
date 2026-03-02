"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Daily Budget", href: "/budget/daily" },
  { label: "Enterprise", href: "/budget/enterprise" },
  { label: "Shelved", href: "/budget/shelved" },
  { label: "People", href: "/people" },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Left: App name */}
        <Link href="/" className="flex-shrink-0 text-lg font-bold tracking-tight">
          News Budget
        </Link>

        {/* Center: Nav links */}
        <nav className="flex flex-1 items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/budget/daily"
                ? pathname.startsWith("/budget/daily")
                : link.href === "/budget/enterprise"
                  ? pathname.startsWith("/budget/enterprise")
                  : link.href === "/budget/shelved"
                    ? pathname.startsWith("/budget/shelved")
                    : pathname.startsWith(link.href)

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus className="size-4" />
              New Story
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/videos/new">
              <Plus className="size-4" />
              New Video
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
