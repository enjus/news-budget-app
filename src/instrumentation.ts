export async function register() {
  // Enable WAL mode for SQLite — allows reads to proceed concurrently with
  // writes, which matters now that budget routes fire multiple parallel queries.
  // Runs once at server startup before any requests are handled.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;")
  }
}
