import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMediaAssignmentSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: mediaRequestId } = await params;

    const mediaRequest = await prisma.mediaRequest.findUnique({ where: { id: mediaRequestId } });
    if (!mediaRequest) {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }

    const assignments = await prisma.mediaAssignment.findMany({
      where: { mediaRequestId },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("GET /api/media-requests/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: mediaRequestId } = await params;
    const body = await request.json();
    const result = createMediaAssignmentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, role } = result.data;

    // Use transaction: create assignment + auto-transition REQUESTED → ASSIGNED
    const assignment = await prisma.$transaction(async (tx) => {
      const mediaRequest = await tx.mediaRequest.findUnique({ where: { id: mediaRequestId } });
      if (!mediaRequest) throw { code: "NOT_FOUND" };

      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person) throw { code: "PERSON_NOT_FOUND" };

      const created = await tx.mediaAssignment.create({
        data: { mediaRequestId, personId, role },
        include: { person: true },
      });

      // Auto-transition status on first assignment
      if (mediaRequest.status === "REQUESTED") {
        await tx.mediaRequest.update({
          where: { id: mediaRequestId },
          data: { status: "ASSIGNED" },
        });
      }

      return created;
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    if (error?.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }
    if (error?.code === "PERSON_NOT_FOUND") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "This person already has that role assigned to this request" },
        { status: 409 }
      );
    }
    console.error("POST /api/media-requests/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}
