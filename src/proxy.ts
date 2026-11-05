import { withAuth } from "next-auth/middleware"

// Next.js 16 "proxy" (formerly middleware). It must live in src/ because the
// app lives in src/app: a root-level file is silently ignored, which is how
// signed-out visitors used to reach every page (and the homepage showed
// "Links couldn't be loaded" instead of bouncing to /login).

export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Beyond the default "token exists" check, reject tokens the periodic
    // role-refresh in src/lib/auth.ts marked `revoked` (the underlying User
    // row was deleted) so a removed account's session stops working on its
    // next request instead of riding out the rest of its JWT lifetime.
    authorized: ({ token }) => !!token && !token.revoked,
  },
})

export const config = {
  matcher: ["/((?!login|api/auth/|api/cron/|_next/static|_next/image|favicon\\.ico|icon\\.png).*)"],
}
