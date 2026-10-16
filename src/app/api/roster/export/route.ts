import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReadLimit } from "@/lib/api-helpers";
import { CSV_BOM, toCsvRow } from "@/lib/csv";
import { buildRosterCsv } from "@/lib/roster";
import { ROSTER_PROFILE_SELECT } from "@/lib/roster-query";
import { ROSTER_WHERE, todayString } from "@/lib/utils";

export const dynamic = 'force-dynamic'

// Active staff (ROSTER_WHERE — freelancers excluded), personal contact
// details included, as a CSV for keeping an offline copy in case of an
// outage or disaster that takes the newsroom tools down. Same audience as the profiles themselves (any
// signed-in user, trust-based); the client shows the confidentiality reminder
// before starting the download. See docs/roster.md.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const people = await prisma.person.findMany({
      where: ROSTER_WHERE,
      select: ROSTER_PROFILE_SELECT,
      orderBy: { name: "asc" },
    });

    const csv = buildRosterCsv(people).map(toCsvRow).join("\r\n") + "\r\n";

    return new Response(CSV_BOM + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="newsroom-roster-${todayString()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/roster/export error:", error);
    return NextResponse.json({ error: "Failed to export roster" }, { status: 500 });
  }
}
