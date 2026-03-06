"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Plus, Menu, X, LogOut, ShieldCheck, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SearchCommand } from "@/components/layout/SearchCommand"
import { cn, initials } from "@/lib/utils"

const navLinks = [
  { label: "Daily", href: "/budget/daily" },
  { label: "Enterprise", href: "/budget/enterprise" },
  { label: "Editions", href: "/budget/edition" },
  { label: "Shelved", href: "/budget/shelved" },
  { label: "People", href: "/people" },
]

function isActive(pathname: string, href: string) {
  return pathname.startsWith(href)
}

export function TopNav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const isAdmin = session?.user?.appRole === "ADMIN"
  const myPersonId = session?.user?.personId

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
          {myPersonId && (
            <Link
              href={`/people/${myPersonId}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive(pathname, `/people/${myPersonId}`) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              Me
            </Link>
          )}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Search — always visible */}
        <SearchCommand />

        {/* Desktop action buttons + user menu */}
        <div className="hidden md:flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/stories/new">
              <Plus className="size-4" />
              New Story
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/videos/new">
              <Plus className="size-4" />
              New Video
            </Link>
          </Button>

          {session?.user && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  aria-label="User menu"
                >
                  {initials(session.user.name ?? "")}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-2">
                <div className="px-2 py-1.5 mb-1">
                  <p className="text-sm font-medium truncate">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <ShieldCheck className="size-3.5" />
                    Admin
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Settings className="size-3.5" />
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </PopoverContent>
            </Popover>
          )}
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
            {isAdmin && (
              <Link
                href="/admin/users"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ShieldCheck className="size-4" />
                Admin
              </Link>
            )}
            {myPersonId && (
              <Link
                href={`/people/${myPersonId}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Me
              </Link>
            )}
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Settings className="size-4" />
              Settings
            </Link>
            {session?.user && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <LogOut className="size-4" />
                Sign out ({session.user.name})
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
