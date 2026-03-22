import { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

/** How often (ms) to re-fetch the user's role from the DB inside the JWT callback. */
const ROLE_REFRESH_BASE_MS = 5 * 60 * 1000 // 5 minutes
/** Random jitter (0–2 min) added per-token to spread DB lookups across users. */
const ROLE_REFRESH_JITTER_MS = 2 * 60 * 1000

/** Pre-hashed dummy value so bcrypt.compare takes consistent time even when user is not found. */
const DUMMY_HASH = "$2a$12$000000000000000000000uGByljPbCHDVMbVJsX.4yuBqFKxVCtz6"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        // Always run bcrypt.compare to prevent timing-based email enumeration
        const valid = await bcrypt.compare(
          credentials.password,
          user?.passwordHash ?? DUMMY_HASH
        )
        if (!user || !valid) return null

        return { id: user.id, name: user.name, email: user.email, appRole: user.appRole, personId: user.personId }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.appRole = (user as { id: string; appRole: string }).appRole
        token.personId = (user as { personId?: string | null }).personId ?? null
        token.roleRefreshedAt = Date.now()
        // Per-token jitter so 100 users don't all refresh roles at the same instant
        token.roleRefreshJitter = Math.floor(Math.random() * ROLE_REFRESH_JITTER_MS)
      }

      // Periodically re-fetch appRole from DB so role changes take effect without re-login
      const lastRefresh = (token.roleRefreshedAt as number) ?? 0
      const jitter = (token.roleRefreshJitter as number) ?? 0
      if (Date.now() - lastRefresh > ROLE_REFRESH_BASE_MS + jitter) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { appRole: true, personId: true },
          })
          if (dbUser) {
            token.appRole = dbUser.appRole
            token.personId = dbUser.personId
          }
        } catch {
          // If DB is unreachable, keep the stale token values
        }
        token.roleRefreshedAt = Date.now()
      }

      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.appRole = token.appRole as string
        session.user.personId = token.personId
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
