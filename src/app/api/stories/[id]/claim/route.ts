import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAssignmentSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

/** Claim — the lightweight action (issue #24 §4, r6). Creates a StoryAssignment
 *  only; nothing else about the pitch moves. Send to budget (a separate route)
 *  is the heavier action that actually commits it. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const invalidType = requireJSON(request);
    if (invalidType) return invalidType;

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

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, pitchedAt: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (story.onBudget || story.pitchedAt === null) {
      return NextResponse.json({ error: "Only an unclaimed pitch can be claimed" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const assignment = await prisma.storyAssignment.create({
      data: { storyId, personId, role },
      include: { person: true },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "This person has already claimed this pitch in that role" },
        { status: 409 }
      );
    }
    console.error("POST /api/stories/[id]/claim error:", error);
    return NextResponse.json({ error: "Failed to claim pitch" }, { status: 500 });
  }
}
