import { withAuth } from "next-auth/middleware"

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
  matcher: ["/((?!login|api/auth/|api/cron/|_next/static|_next/image|favicon\\.ico).*)"],
}
