import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePersonSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json(person);
  } catch (error) {
    console.error("GET /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch person" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const body = await request.json();
    const result = updatePersonSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const person = await prisma.person.update({
      where: { id },
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

    return NextResponse.json(person);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A person with that email already exists" }, { status: 409 });
    }
    console.error("PATCH /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
            videoAssignments: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (person._count.assignments > 0 || person._count.videoAssignments > 0) {
      return NextResponse.json(
        { error: "Cannot delete person with existing assignments. Remove assignments first." },
        { status: 409 }
      );
    }

    await prisma.person.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    console.error("DELETE /api/people/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete person" }, { status: 500 });
  }
}
