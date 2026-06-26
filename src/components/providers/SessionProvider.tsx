"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { apiPath } from "@/lib/api-path"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider basePath={apiPath("/api/auth")}>
      {children}
    </NextAuthSessionProvider>
  )
}
