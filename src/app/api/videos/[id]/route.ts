import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateVideoSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit, blockedFromDraft, prismaErrorCode, draftGateSelect, checkVersionConflict } from "@/lib/api-helpers";
import { commentInclude, commentOrderBy } from "@/lib/comments";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
  _count: { select: { comments: true } },
  comments: { include: commentInclude, orderBy: commentOrderBy },
  createdByUser: { select: { id: true, name: true } },
} as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      include: videoInclude,
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Off-budget drafts are only visible to their creator, assignees, or admins
    const session = await getServerSession(authOptions);
    if (blockedFromDraft(video, session?.user)) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (error) {
    console.error("GET /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
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

    // Block non-owners/non-assignees from editing off-budget drafts
    const existingDraft = await prisma.video.findUnique({
      where: { id },
      select: draftGateSelect,
    });
    if (existingDraft && blockedFromDraft(existingDraft, session.user)) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateVideoSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, storyId, version: clientVersion, ...rest } = result.data;

    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...rest };

    // If TBD is false but no date provided, revert to TBD
    if (onlinePubDate !== undefined || rest.onlinePubDateTBD !== undefined) {
      const onlineTBD = rest.onlinePubDateTBD || !onlinePubDate;
      data.onlinePubDateTBD = onlineTBD;
      data.onlinePubDate = onlineTBD ? null : new Date(onlinePubDate!);
    }
    if ("storyId" in result.data) {
      data.storyId = storyId ?? null;
    }

    // Track when a video is shelved for the 90-day auto-deletion clock
    if (rest.status === "SHELVED") {
      const existing = await prisma.video.findUnique({ where: { id }, select: { status: true } });
      if (existing && existing.status !== "SHELVED") {
        data.shelvedAt = new Date();
      }
    } else if (rest.status !== undefined) {
      data.shelvedAt = null;
    }

    // Always increment version on every update
    data.version = { increment: 1 };

    // If client sent a version, use optimistic locking to detect conflicts
    if (clientVersion !== undefined) {
      const conflict = await checkVersionConflict(prisma.video, id, clientVersion, data, "video");
      if (conflict) return conflict;
      const video = await prisma.video.findUnique({ where: { id }, include: videoInclude });
      return NextResponse.json(video);
    }

    // No version provided (e.g. DnD reorder) — update without conflict check
    const video = await prisma.video.update({
      where: { id },
      data,
      include: videoInclude,
    });

    return NextResponse.json(video);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    if (prismaErrorCode(error) === "P2002") {
      return NextResponse.json({ error: "A video with that slug already exists" }, { status: 409 });
    }
    console.error("PATCH /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to update video" }, { status: 500 });
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

    // Block non-owners/non-assignees from deleting off-budget drafts
    const existingDraft = await prisma.video.findUnique({
      where: { id },
      select: draftGateSelect,
    });
    if (existingDraft && blockedFromDraft(existingDraft, session.user)) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    await prisma.video.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    console.error("DELETE /api/videos/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete video" }, { status: 500 });
  }
}
