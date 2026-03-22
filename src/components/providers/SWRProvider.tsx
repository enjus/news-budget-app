"use client"

import { SWRConfig } from "swr"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error(`Request failed with status ${res.status}`)
    throw error
  }
  return res.json()
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, dedupingInterval: 10_000, focusThrottleInterval: 60_000 }}>
      {children}
    </SWRConfig>
  )
}
