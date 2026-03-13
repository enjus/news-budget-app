import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Only self or admin can generate a token
    const isAdmin = session.user.appRole === "ADMIN";
    const isSelf = session.user.personId === id;
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const token = randomBytes(32).toString("hex");
    const person = await prisma.person.update({
      where: { id },
      data: { calendarToken: token },
      select: { id: true, calendarToken: true },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("POST /api/people/[id]/calendar-token error:", error);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
