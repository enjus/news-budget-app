import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVideoAssignmentSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: videoId } = await params;

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const assignments = await prisma.videoAssignment.findMany({
      where: { videoId },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("GET /api/videos/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { id: videoId } = await params;
    const body = await request.json();
    const result = createVideoAssignmentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { personId, role } = result.data;

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Check for duplicate
    const existing = await prisma.videoAssignment.findUnique({
      where: { videoId_personId_role: { videoId, personId, role } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This person already has that role assigned to this video" },
        { status: 409 }
      );
    }

    const assignment = await prisma.videoAssignment.create({
      data: { videoId, personId, role },
      include: { person: true },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "This person already has that role assigned to this video" },
        { status: 409 }
      );
    }
    console.error("POST /api/videos/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { id: videoId } = await params;
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const role = searchParams.get("role");

    if (!personId || !role) {
      return NextResponse.json(
        { error: "Query params personId and role are required" },
        { status: 400 }
      );
    }

    const assignment = await prisma.videoAssignment.findUnique({
      where: { videoId_personId_role: { videoId, personId, role } },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    await prisma.videoAssignment.delete({
      where: { videoId_personId_role: { videoId, personId, role } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/videos/[id]/assignments error:", error);
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
