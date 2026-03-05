"use client"

import { useState, useCallback } from "react"

export type DefaultView = "daily-columns" | "daily-agenda" | "enterprise" | "edition"
export type ContentDefault = "all" | "stories" | "videos"

export interface UserPreferences {
  defaultView: DefaultView
  contentDefault: ContentDefault
}

const STORAGE_KEY = "news-budget-prefs"

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultView: "daily-columns",
  contentDefault: "all",
}

function readPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_PREFERENCES
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(readPreferences)

  const setPreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferencesState((prev) => {
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage unavailable — changes apply in-session only
      }
      return next
    })
  }, [])

  return { preferences, setPreferences }
}
