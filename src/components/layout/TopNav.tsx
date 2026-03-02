"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchCommand } from "@/components/layout/SearchCommand"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Daily", href: "/budget/daily" },
  { label: "Daily Edition", href: "/budget/edition" },
  { label: "Enterprise", href: "/budget/enterprise" },
  { label: "Shelved", href: "/budget/shelved" },
  { label: "People", href: "/people" },
]

function isActive(pathname: string, href: string) {
  return pathname.startsWith(href)
}

export function TopNav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">

        {/* Logo */}
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          News Budget
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex flex-1 items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive(pathname, link.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Search — always visible */}
        <SearchCommand />

        {/* Desktop action buttons */}
        <div className="hidden md:flex items-center gap-2">
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

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="border-t md:hidden">
          <nav className="mx-auto max-w-7xl px-4 py-2 space-y-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive(pathname, link.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 border-t" />
            <Link
              href="/stories/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Plus className="size-4" />
              New Story
            </Link>
            <Link
              href="/videos/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Plus className="size-4" />
              New Video
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
