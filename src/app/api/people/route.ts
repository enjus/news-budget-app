import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPersonSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const take = Math.min(parseInt(searchParams.get("take") ?? "200", 10) || 200, 500);
    const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;

    const people = await prisma.person.findMany({
      where: role ? { defaultRole: role } : undefined,
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take,
      skip,
    });

    return NextResponse.json(people);
  } catch (error) {
    console.error("GET /api/people error:", error);
    return NextResponse.json({ error: "Failed to fetch people" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const body = await request.json();
    const result = createPersonSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const person = await prisma.person.create({
      data: result.data,
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A person with that email already exists" }, { status: 409 });
    }
    console.error("POST /api/people error:", error);
    return NextResponse.json({ error: "Failed to create person" }, { status: 500 });
  }
}
