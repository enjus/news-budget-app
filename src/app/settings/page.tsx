"use client"

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"
import { usePreferences } from "@/lib/hooks/usePreferences"
import type { DefaultView, ContentDefault } from "@/lib/hooks/usePreferences"
import { cn } from "@/lib/utils"

// ─── Option button ────────────────────────────────────────────────────────────

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted"
      )}
    >
      {children}
    </button>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { preferences, setPreferences } = usePreferences()

  const DEFAULT_VIEW_OPTIONS: { value: DefaultView; label: string }[] = [
    { value: "daily-columns", label: "Daily budget — columns" },
    { value: "daily-agenda",  label: "Daily budget — agenda" },
    { value: "enterprise",    label: "Enterprise budget" },
    { value: "edition",       label: "Daily edition budget" },
  ]

  const CONTENT_OPTIONS: { value: ContentDefault; label: string }[] = [
    { value: "all",     label: "Stories & videos" },
    { value: "stories", label: "Stories only" },
    { value: "videos",  label: "Videos only" },
  ]

  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved to this browser. Changes take effect immediately.
        </p>
      </div>

      {/* Appearance */}
      <Section title="Appearance">
        <div>
          <p className="mb-2 text-sm font-medium">Theme</p>
          <div className="flex flex-wrap gap-2">
            <OptionButton active={theme === "light"} onClick={() => setTheme("light")}>
              <Sun className="size-3.5" /> Light
            </OptionButton>
            <OptionButton active={theme === "dark"} onClick={() => setTheme("dark")}>
              <Moon className="size-3.5" /> Dark
            </OptionButton>
            <OptionButton active={theme === "system" || !theme} onClick={() => setTheme("system")}>
              <Monitor className="size-3.5" /> System
            </OptionButton>
          </div>
        </div>
      </Section>

      {/* Budget */}
      <Section title="Budget">
        <div>
          <p className="mb-2 text-sm font-medium">Default start view</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Where to land when opening the app on desktop. Mobile always opens the agenda view.
          </p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_VIEW_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                active={preferences.defaultView === opt.value}
                onClick={() => setPreferences({ defaultView: opt.value })}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <p className="mb-2 text-sm font-medium">Daily budget content</p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                active={preferences.contentDefault === opt.value}
                onClick={() => setPreferences({ contentDefault: opt.value })}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}
