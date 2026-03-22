import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAssignmentSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const assignments = await prisma.storyAssignment.findMany({
      where: { storyId },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("GET /api/stories/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id: storyId } = await params;
    const body = await request.json();
    const result = createAssignmentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, role } = result.data;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Check for duplicate
    const existing = await prisma.storyAssignment.findUnique({
      where: { storyId_personId_role: { storyId, personId, role } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This person already has that role assigned to this story" },
        { status: 409 }
      );
    }

    const assignment = await prisma.storyAssignment.create({
      data: { storyId, personId, role },
      include: { person: true },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "This person already has that role assigned to this story" },
        { status: 409 }
      );
    }
    console.error("POST /api/stories/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id: storyId } = await params;
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const role = searchParams.get("role");

    if (!personId || !role) {
      return NextResponse.json(
        { error: "Query params personId and role are required" },
        { status: 400 }
      );
    }

    const assignment = await prisma.storyAssignment.findUnique({
      where: { storyId_personId_role: { storyId, personId, role } },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    await prisma.storyAssignment.delete({
      where: { storyId_personId_role: { storyId, personId, role } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/stories/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
