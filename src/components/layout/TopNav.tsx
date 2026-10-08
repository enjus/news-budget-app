"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSession, signOut } from "next-auth/react"
import { Plus, Menu, X, LogOut, ShieldCheck, Settings, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SearchCommand } from "@/components/layout/SearchCommand"
import { cn, initials, hasAdminAccess, canCreateContent } from "@/lib/utils"
import { isTabActive, EXTERNAL_NAV_LINKS } from "@/lib/nav"
import { useNav } from "@/lib/hooks/useNav"
import { apiPath } from "@/lib/api-path"
import { VIDEOS_ENABLED } from "@/lib/features"
import masthead from "@/assets/brand/oregonian-masthead.png"
import mark from "@/assets/brand/oregonian-mark.png"

export function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const { data: session } = useSession()
  const appRole = session?.user?.appRole ?? ""
  const isAdmin = hasAdminAccess(appRole)
  const canCreate = canCreateContent(appRole)
  const { pathname, sections, current } = useNav()
  const topSections = sections.filter((s) => s.enabled && s.inTopBar)
  // The mobile menu stands in for SectionTabNav, so it also includes a
  // flagged-off section when you're already inside it by direct URL.
  const menuSections = sections.filter((s) => s.enabled || s.id === current?.id)

  return (
    <>
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
            {EXTERNAL_NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
                <ExternalLink className="size-3.5" />
              </a>
            ))}
          </nav>

          {/* Spacer on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Search — always visible */}
          <SearchCommand />

          {/* Mobile create — kept out of the hamburger so it's one tap away */}
          {canCreate && (
            VIDEOS_ENABLED ? (
              <Popover open={createOpen} onOpenChange={setCreateOpen}>
                <PopoverTrigger asChild>
                  <Button size="icon-sm" className="md:hidden" aria-label="Create new">
                    <Plus className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 p-1 md:hidden">
                  {[
                    { href: "/stories/new", label: "New Story" },
                    { href: "/videos/new", label: "New Video" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setCreateOpen(false)}
                      className="flex rounded-sm px-2 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <Button asChild size="icon-sm" className="md:hidden">
                <Link href="/stories/new" aria-label="New Story">
                  <Plus className="size-4" />
                </Link>
              </Button>
            )
          )}

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
                  <AccountLinks name={session.user.name} email={session.user.email} showAdmin={isAdmin} compact />
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
          // Capped to the viewport and scrollable: the header is sticky, so
          // anything taller would hang off the bottom with no way to reach it.
          <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t md:hidden">
            {/* Any link tap closes the menu — including the page you're already
                on and external links, which never change the pathname. */}
            <nav
              className="mx-auto max-w-7xl px-4 py-2 space-y-0.5"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setMobileOpen(false)
              }}
            >
              {menuSections.map((section, i) => (
                <div
                  key={section.id}
                  className={cn(i > 0 && "mt-2 border-t pt-2")}
                >
                  {section.tabs.length === 0 ? (
                    <Link
                      href={section.href}
                      className={cn(
                        "flex rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        current?.id === section.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      )}
                    >
                      {section.label}
                    </Link>
                  ) : (
                    <>
                      <p className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      {section.tabs.map((tab) => (
                        <Link
                          key={tab.href}
                          href={tab.href}
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
              {EXTERNAL_NAV_LINKS.map((link, i) => (
                <div key={link.href} className={cn(i === 0 && "mt-2 border-t pt-2")}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {link.label}
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ))}
              {session?.user && (
                <div className="mt-2 border-t pt-2">
                  <AccountLinks name={session.user.name} email={session.user.email} />
                </div>
              )}
            </nav>
          </div>
        )}
      </header>
      {/* Tap-outside to close. A sibling of <header>, not a child: the
          header's backdrop-filter would make it the containing block for a
          fixed child, pinning the backdrop to the header instead of the viewport. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}

/** Account header + links shared by the desktop user popover and the mobile menu. */
function AccountLinks({
  name,
  email,
  showAdmin = false,
  compact = false,
}: {
  name?: string | null
  email?: string | null
  showAdmin?: boolean
  compact?: boolean
}) {
  const row = cn(
    "flex w-full items-center gap-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
    compact ? "rounded-sm px-2 py-1.5 text-sm" : "rounded-md px-3 py-2.5 text-sm font-medium"
  )
  const icon = compact ? "size-3.5" : "size-4"

  return (
    <>
      <div className={cn(compact ? "mb-1 px-2 py-1.5" : "px-3 pt-1.5 pb-1")}>
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      {showAdmin && (
        <Link href="/admin/users" className={row}>
          <ShieldCheck className={icon} />
          Admin
        </Link>
      )}
      <Link href="/settings" className={row}>
        <Settings className={icon} />
        Settings
      </Link>
      <button onClick={() => signOut({ callbackUrl: apiPath("/login") })} className={row}>
        <LogOut className={icon} />
        Sign out
      </button>
    </>
  )
}
