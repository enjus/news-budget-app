import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReadLimit } from "@/lib/api-helpers";
import { ROSTER_MAP_SELECT } from "@/lib/roster-query";
import type { RosterMapPin } from "@/types/index";

export const dynamic = 'force-dynamic'

// Dots for /roster/map: active people who have placed a pin. Only name, title,
// staff status, and coordinates — never addresses or other PersonPrivate
// fields. Same audience as the roster profiles (any signed-in user).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const people = await prisma.person.findMany({
      where: {
        isActive: true,
        private: { is: { latitude: { not: null }, longitude: { not: null } } },
      },
      select: ROSTER_MAP_SELECT,
      take: 1000,
    });

    const pins: RosterMapPin[] = people.map(({ private: priv, ...p }) => ({
      ...p,
      latitude: priv!.latitude!,
      longitude: priv!.longitude!,
    }));

    return NextResponse.json(pins, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/roster/map error:", error);
    return NextResponse.json({ error: "Failed to fetch roster map" }, { status: 500 });
  }
}
