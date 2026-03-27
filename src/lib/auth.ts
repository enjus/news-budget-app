import { type NextAuthOptions } from "next-auth"
import type { Profile } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import AzureADProvider from "next-auth/providers/azure-ad"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

/** How often (ms) to re-fetch the user's role from the DB inside the JWT callback. */
const ROLE_REFRESH_BASE_MS = 5 * 60 * 1000 // 5 minutes
/** Random jitter (0–2 min) added per-token to spread DB lookups across users. */
const ROLE_REFRESH_JITTER_MS = 2 * 60 * 1000

/** Pre-hashed dummy value so bcrypt.compare takes consistent time even when user is not found. */
const DUMMY_HASH = "$2a$12$000000000000000000000uGByljPbCHDVMbVJsX.4yuBqFKxVCtz6"

/** Azure AD profile includes group membership when "groups" claim is configured. */
interface AzureADProfile extends Profile {
  groups?: string[]
}

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
          include: { person: { select: { defaultRole: true } } },
        })

        // SSO-only users have no passwordHash — reject credential login for them
        if (!user?.passwordHash) {
          // Still run bcrypt.compare against dummy to prevent timing-based enumeration
          await bcrypt.compare(credentials.password, DUMMY_HASH)
          return null
        }

        // Always run bcrypt.compare to prevent timing-based email enumeration
        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email, appRole: user.appRole, personId: user.personId, personDefaultRole: user.person?.defaultRole ?? null }
      },
    }),

    // Azure AD SSO — configure via AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID
    ...(process.env.AZURE_AD_CLIENT_ID
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "azure-ad") {
        const azureProfile = profile as AzureADProfile | undefined
        const allowedGroupId = process.env.AZURE_AD_ALLOWED_GROUP_ID

        // If an allowed group is configured, enforce membership
        if (allowedGroupId) {
          const groups = azureProfile?.groups ?? []
          if (!groups.includes(allowedGroupId)) {
            return false
          }
        }

        // Look up or auto-create the user by email
        const email = user.email
        if (!email) return false

        const dbUser = await prisma.user.findUnique({
          where: { email },
        })

        if (!dbUser) {
          // Auto-create with VIEWER role — admin can promote later
          await prisma.user.create({
            data: {
              email,
              name: user.name ?? email,
              passwordHash: null,
              appRole: "VIEWER",
            },
          })
        }

        return true
      }

      // Credentials provider — always allow (authorize already validated)
      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "azure-ad") {
          // SSO sign-in: look up appRole/personId from the DB user
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
            select: { id: true, appRole: true, personId: true, person: { select: { defaultRole: true } } },
          })
          if (dbUser) {
            token.id = dbUser.id
            token.appRole = dbUser.appRole
            token.personId = dbUser.personId
            token.personDefaultRole = dbUser.person?.defaultRole ?? null
          }
        } else {
          // Credentials sign-in: user object already has appRole from authorize()
          token.id = user.id
          token.appRole = (user as { id: string; appRole: string }).appRole
          token.personId = (user as { personId?: string | null }).personId ?? null
          token.personDefaultRole = (user as { personDefaultRole?: string | null }).personDefaultRole ?? null
        }
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
            select: { appRole: true, personId: true, person: { select: { defaultRole: true } } },
          })
          if (dbUser) {
            token.appRole = dbUser.appRole
            token.personId = dbUser.personId
            token.personDefaultRole = dbUser.person?.defaultRole ?? null
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
        session.user.personDefaultRole = token.personDefaultRole
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
