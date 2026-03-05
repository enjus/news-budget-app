"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePreferences } from "@/lib/hooks/usePreferences"
import { todayString } from "@/lib/utils"

export default function HomePage() {
  const router = useRouter()
  const { preferences } = usePreferences()

  useEffect(() => {
    const today = todayString()
    switch (preferences.defaultView) {
      case "enterprise": router.replace("/budget/enterprise"); break
      case "edition":    router.replace("/budget/edition");    break
      default:           router.replace(`/budget/daily/${today}`)
    }
  }, [preferences.defaultView, router])

  return null
}
