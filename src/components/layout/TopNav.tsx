"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSession, signOut } from "next-auth/react"
import { Plus, Menu, X, LogOut, ShieldCheck, Settings, CalendarDays, Users, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SearchCommand } from "@/components/layout/SearchCommand"
import { cn, initials, hasAdminAccess, canCreateContent, canViewPeople } from "@/lib/utils"
import { isTabActive } from "@/lib/nav"
import { useNav } from "@/lib/hooks/useNav"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"
import masthead from "@/assets/brand/oregonian-masthead.png"
import mark from "@/assets/brand/oregonian-mark.png"

export function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const isAdmin = hasAdminAccess(appRole)
  const canCreate = canCreateContent(appRole)
  const showPeople = canViewPeople(appRole)
  const { pathname, sections, current } = useNav()
  const topSections = sections.filter((s) => s.enabled)
  // The mobile menu stands in for SectionTabNav, so it also includes a
  // flagged-off section when you're already inside it by direct URL.
  const menuSections = sections.filter((s) => s.enabled || s.id === current?.id)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">

        {/* Logo */}
        <Link href="/" className="shrink-0" aria-label="The Oregonian News Budget, home">
          {/* Static imports so the paths pick up BASE_PATH. No `priority`:
              one of the pair is display:none at every breakpoint, and lazy
              images that aren't rendered never load. */}
          <Image
            src={masthead}
            alt="The Oregonian"
            className="hidden h-[23px] w-auto dark:invert md:block"
          />
          <Image
            src={mark}
            alt="The Oregonian"
            className="h-8 w-auto dark:invert md:hidden"
          />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex flex-1 items-center gap-1 pl-2">
          {topSections.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              aria-current={current?.id === section.id ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                current?.id === section.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              {section.label}
            </Link>
          ))}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Search — always visible */}
        <SearchCommand />

        {/* Desktop action buttons + user menu */}
        <div className="hidden md:flex items-center gap-2">
          {canCreate && (
            <>
              <Button asChild size="sm">
                <Link href="/stories/new">
                  <Plus className="size-4" />
                  New Story
                </Link>
              </Button>
              {VIDEOS_ENABLED && (
                <Button asChild size="sm">
                  <Link href="/videos/new">
                    <Plus className="size-4" />
                    New Video
                  </Link>
                </Button>
              )}
            </>
          )}

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
                  <>
                    <Link
                      href="/admin/users"
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <ShieldCheck className="size-3.5" />
                      Users
                    </Link>
                    <Link
                      href="/admin/teams"
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <ShieldCheck className="size-3.5" />
                      Teams
                    </Link>
                    <Link
                      href="/admin/tags"
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Tag className="size-3.5" />
                      Tags
                    </Link>
                    <Link
                      href="/admin/calendar"
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <CalendarDays className="size-3.5" />
                      Calendar
                    </Link>
                  </>
                )}
                {showPeople && (
                  <Link
                    href="/people"
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Users className="size-3.5" />
                    People
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
                  onClick={() => signOut({ callbackUrl: apiPath("/login") })}
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
            {menuSections.map((section, i) => (
              <div key={section.id} className={cn(i > 0 && "pt-2")}>
                {section.tabs.length === 0 ? (
                  <Link
                    href={section.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      current?.id === section.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    )}
                  >
                    {section.label}
                  </Link>
                ) : (
                  <>
                    <Link
                      href={section.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      {section.label}
                    </Link>
                    {section.tabs.map((tab) => (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                          isTabActive(pathname, tab) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                        )}
                      >
                        {tab.label}
                      </Link>
                    ))}
                  </>
                )}
              </div>
            ))}
            {canCreate && (
              <>
                <div className="my-1 border-t" />
                <Link
                  href="/stories/new"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Plus className="size-4" />
                  New Story
                </Link>
                {VIDEOS_ENABLED && (
                  <Link
                    href="/videos/new"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Plus className="size-4" />
                    New Video
                  </Link>
                )}
              </>
            )}
            <div className="my-1 border-t" />
            {isAdmin && (
              <>
                <Link
                  href="/admin/users"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ShieldCheck className="size-4" />
                  Users
                </Link>
                <Link
                  href="/admin/teams"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ShieldCheck className="size-4" />
                  Teams
                </Link>
                <Link
                  href="/admin/tags"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Tag className="size-4" />
                  Tags
                </Link>
                <Link
                  href="/admin/calendar"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <CalendarDays className="size-4" />
                  Calendar
                </Link>
              </>
            )}
            {showPeople && (
              <Link
                href="/people"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Users className="size-4" />
                People
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
                onClick={() => signOut({ callbackUrl: apiPath("/login") })}
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
