import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { TopNav } from "@/components/layout/TopNav"
import { Toaster } from "@/components/ui/sonner"
import { SWRProvider } from "@/components/providers/SWRProvider"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { SessionProvider } from "@/components/providers/SessionProvider"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "News Budget",
  description: "News budget tracking for stories and videos",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider>
          <ThemeProvider>
            <SWRProvider>
              <TopNav />
              <main className="min-h-[calc(100vh-3.5rem)]">
                {children}
              </main>
              <Toaster />
            </SWRProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
