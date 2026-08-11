import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCommentSchema } from "@/lib/validations";
import { canCreateContent, hasAdminAccess } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";
import { commentInclude } from "@/lib/comments";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

/** Editing is author-only. Edits never send email. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const raw = await request.json();
    const result = updateCommentSchema.safeParse(raw);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only edit your own comments" },
        { status: 403 }
      );
    }

    const mentionIds = [...new Set(result.data.mentionIds ?? [])];
    if (mentionIds.length > 0) {
      const found = await prisma.person.count({ where: { id: { in: mentionIds } } });
      if (found !== mentionIds.length) {
        return NextResponse.json(
          { error: "Validation failed", fieldErrors: { mentionIds: ["One or more tagged people no longer exist"] } },
          { status: 400 }
        );
      }
    }

    // Mentions are replaced wholesale — the body is the source of truth for who
    // is tagged, so an edit that removes an "@Name" must drop the row too.
    const [, comment] = await prisma.$transaction([
      prisma.commentMention.deleteMany({ where: { commentId: id } }),
      prisma.comment.update({
        where: { id },
        data: {
          body: result.data.body,
          editedAt: new Date(),
          mentions: { create: mentionIds.map((personId) => ({ personId })) },
        },
        include: commentInclude,
      }),
    ]);

    return NextResponse.json(comment);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    console.error("PATCH /api/comments/[id] error:", error);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

/** Deleting is author-or-admin. */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;

    const existing = await prisma.comment.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.authorId !== session.user.id && !hasAdminAccess(session.user.appRole)) {
      return NextResponse.json(
        { error: "You can only delete your own comments" },
        { status: 403 }
      );
    }

    await prisma.comment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    console.error("DELETE /api/comments/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
