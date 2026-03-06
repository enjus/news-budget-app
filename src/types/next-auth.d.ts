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
  }
}
