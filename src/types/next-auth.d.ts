import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    appRole: string
  }
  interface Session {
    user: {
      id: string
      appRole: string
      personId?: string | null
      personDefaultRole?: string | null
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    appRole: string
    personId?: string | null
    personDefaultRole?: string | null
    /** Set when the periodic role-refresh finds the underlying User row gone
     *  (deleted, not just an unreachable DB) — see src/lib/auth.ts and
     *  middleware.ts's `authorized` callback. */
    revoked?: boolean
  }
}
