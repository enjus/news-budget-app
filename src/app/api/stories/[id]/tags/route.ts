import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStoryTagSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit, blockedFromDraft, prismaErrorCode } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, createdByUserId: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    if (blockedFromDraft(story, session?.user)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const tags = await prisma.storyTag.findMany({
      where: { storyId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error("GET /api/stories/[id]/tags error:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
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
    const result = createStoryTagSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { tag } = result.data;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, createdByUserId: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (blockedFromDraft(story, session.user)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const storyTag = await prisma.storyTag.create({
      data: { storyId, tag },
    });

    return NextResponse.json(storyTag, { status: 201 });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2002") {
      return NextResponse.json({ error: "This tag is already applied to this story" }, { status: 409 });
    }
    console.error("POST /api/stories/[id]/tags error:", error);
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
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
    const tag = searchParams.get("tag");

    if (!tag) {
      return NextResponse.json({ error: "Query param tag is required" }, { status: 400 });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { onBudget: true, createdByUserId: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (blockedFromDraft(story, session.user)) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    await prisma.storyTag.delete({
      where: { storyId_tag: { storyId, tag } },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    console.error("DELETE /api/stories/[id]/tags error:", error);
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}
