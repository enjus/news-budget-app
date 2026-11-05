import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Next.js 16 "proxy" (formerly middleware). It must live in src/, next to
// src/app; a root-level file is silently ignored.
//
// Hand-rolled rather than next-auth's withAuth(): withAuth skips every path
// that starts with NEXTAUTH_URL's path, so under BASE_PATH a NEXTAUTH_URL of
// "https://host/news-budget" (no /api/auth) would turn the whole gate off.
export default async function proxy(req: NextRequest) {
  const token = await getToken({ req })
  // Also reject tokens the periodic role-refresh in src/lib/auth.ts marked
  // `revoked` (the underlying User row was deleted), so a removed account's
  // session stops working on its next request instead of riding out the rest
  // of its JWT lifetime.
  if (token && !token.revoked) return NextResponse.next()

  const { pathname, search, basePath } = req.nextUrl
  // API callers get the same 401 the route handlers return, not an HTML
  // login page that fetchers would fail to parse.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const login = new URL(`${basePath}/login`, req.url)
  login.searchParams.set("callbackUrl", `${basePath}${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  // "/" is listed on its own because the catch-all pattern doesn't match the
  // bare basePath root (e.g. /news-budget) when BASE_PATH is set.
  matcher: [
    "/",
    "/((?!login(?:/|$)|api/auth/|api/cron/|_next/static|_next/image|favicon\\.ico|icon\\.png).*)",
  ],
}
