export async function register() {
  // Enable WAL mode for SQLite (local dev only) — allows reads to proceed
  // concurrently with writes. Skipped when using a remote PostgreSQL database.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      const { prisma } = await import("@/lib/prisma")
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;")
    }
  }
}
