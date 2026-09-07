import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWriteLimit, blockedFromDraft, draftGateSelect, checkVersionConflict } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const videoInclude = {
  assignments: { include: { person: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
  _count: { select: { comments: true } },
} as const;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    // Optional body: { version }, for optimistic locking — same pattern as
    // PATCH /api/videos/[id] (and the mirrored story-side publish route).
    // Optional (not requireJSON()'d) because an existing caller, MeView's
    // "My Drafts" list, POSTs with no body at all — its list payload doesn't
    // carry a video's version, so it can't send one.
    let clientVersion: number | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.version === "number") clientVersion = body.version;
    }

    const video = await prisma.video.findUnique({
      where: { id },
      select: draftGateSelect,
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.onBudget) {
      return NextResponse.json({ error: "Video is already on the budget" }, { status: 400 });
    }

    // Only the creator, an assignee, or an admin can publish a draft
    if (blockedFromDraft(video, session.user)) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (clientVersion !== undefined) {
      const conflict = await checkVersionConflict(
        prisma.video,
        id,
        clientVersion,
        { onBudget: true, version: { increment: 1 } },
        "video"
      );
      if (conflict) return conflict;
      const full = await prisma.video.findUnique({ where: { id }, include: videoInclude });
      return NextResponse.json(full);
    }

    const updated = await prisma.video.update({
      where: { id },
      data: { onBudget: true, version: { increment: 1 } },
      include: videoInclude,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/videos/[id]/publish error:", error);
    return NextResponse.json({ error: "Failed to publish video" }, { status: 500 });
  }
}
