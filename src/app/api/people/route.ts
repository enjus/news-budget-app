import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPersonSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const people = await prisma.person.findMany({
      where: role ? { defaultRole: role } : undefined,
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
            mediaAssignments: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(people);
  } catch (error) {
    console.error("GET /api/people error:", error);
    return NextResponse.json({ error: "Failed to fetch people" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
            mediaAssignments: true,
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
