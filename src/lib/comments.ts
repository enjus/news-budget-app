import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCommentSchema } from "@/lib/validations";
import { canCreateContent, hasAdminAccess } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";
import {
  collectEmails,
  notifyCommentMention,
  notifyCommentTeam,
  type CommentedItem,
} from "@/lib/notifications";

/** Relations every comment response carries. */
export const commentInclude = {
  author: { select: { id: true, name: true, email: true } },
  mentions: { include: { person: { select: { id: true, name: true } } } },
} as const;

/** Comments oldest-first, the way a conversation reads. */
export const commentOrderBy = { createdAt: "asc" } as const;

type Kind = "story" | "video";

const parentDraftSelect = { id: true, onBudget: true, createdByUserId: true } as const;

/**
 * GET handler shared by /api/stories/[id]/comments and /api/videos/[id]/comments.
 * Read access matches the other child collections (assignments, visuals): any
 * request that got past the auth middleware can read — except off-budget
 * drafts, which stay visible only to their creator (or admins), same as the
 * parent story/video detail route.
 */
export async function listComments(kind: Kind, parentId: string) {
  const parent =
    kind === "story"
      ? await prisma.story.findUnique({ where: { id: parentId }, select: parentDraftSelect })
      : await prisma.video.findUnique({ where: { id: parentId }, select: parentDraftSelect });

  if (!parent) {
    return NextResponse.json(
      { error: kind === "story" ? "Story not found" : "Video not found" },
      { status: 404 }
    );
  }

  if (!parent.onBudget) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (parent.createdByUserId !== session.user.id && !hasAdminAccess(session.user.appRole))) {
      return NextResponse.json(
        { error: kind === "story" ? "Story not found" : "Video not found" },
        { status: 404 }
      );
    }
  }

  const comments = await prisma.comment.findMany({
    where: kind === "story" ? { storyId: parentId } : { videoId: parentId },
    include: commentInclude,
    orderBy: commentOrderBy,
  });

  return NextResponse.json(comments);
}

/**
 * POST handler shared by both comment collections. Creates the comment, then
 * fires notification emails without blocking the response:
 *
 *  - mentioned People are always emailed (plain "Post" included);
 *  - the item's team is emailed only when notifyAll is true, minus anyone
 *    already emailed as a mention and minus the author, so nobody is
 *    double-notified. "Team" means assignees plus, on stories, anyone credited
 *    on a visual element — matching who notifyStoryTeam() reaches.
 */
export async function createComment(
  kind: Kind,
  request: NextRequest,
  parentId: string
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canCreateContent(session.user.appRole)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const limited = checkWriteLimit(session.user.id);
  if (limited) return limited;

  const raw = await request.json();
  const result = createCommentSchema.safeParse(raw);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { body, notifyAll } = result.data;
  const mentionIds = [...new Set(result.data.mentionIds ?? [])];

  const parentSelect = {
    id: true,
    slug: true,
    budgetLine: true,
    onBudget: true,
    createdByUserId: true,
    assignments: { select: { role: true, person: { select: { name: true, email: true } } } },
  } as const;

  // Fetched into separate consts rather than one union-typed `parent` so the
  // story-only `visuals` relation stays visible to TypeScript below.
  const storyParent =
    kind === "story"
      ? await prisma.story.findUnique({
          where: { id: parentId },
          select: {
            ...parentSelect,
            visuals: { select: { person: { select: { name: true, email: true } } } },
          },
        })
      : null;
  const videoParent =
    kind === "video"
      ? await prisma.video.findUnique({ where: { id: parentId }, select: parentSelect })
      : null;
  const parent = storyParent ?? videoParent;

  if (!parent) {
    return NextResponse.json(
      { error: kind === "story" ? "Story not found" : "Video not found" },
      { status: 404 }
    );
  }

  if (!parent.onBudget && parent.createdByUserId !== session.user.id && !hasAdminAccess(session.user.appRole)) {
    return NextResponse.json(
      { error: kind === "story" ? "Story not found" : "Video not found" },
      { status: 404 }
    );
  }

  const mentioned = mentionIds.length
    ? await prisma.person.findMany({
        where: { id: { in: mentionIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  if (mentioned.length !== mentionIds.length) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: { mentionIds: ["One or more tagged people no longer exist"] } },
      { status: 400 }
    );
  }

  const authorName = session.user.name || session.user.email || "Unknown user";

  const comment = await prisma.comment.create({
    data: {
      body,
      authorId: session.user.id,
      authorName,
      ...(kind === "story" ? { storyId: parentId } : { videoId: parentId }),
      mentions: { create: mentioned.map((p) => ({ personId: p.id })) },
    },
    include: commentInclude,
  });

  const item: CommentedItem = {
    id: parent.id,
    slug: parent.slug,
    budgetLine: parent.budgetLine,
  };
  const notification = { item, kind, authorName, body };

  const mentionRecipients = [
    ...new Set(mentioned.map((p) => p.email).filter(Boolean)),
  ];

  if (mentionRecipients.length > 0) {
    notifyCommentMention({ ...notification, recipients: mentionRecipients }).catch((err) =>
      console.error("notifyCommentMention failed:", err)
    );
  }

  if (notifyAll) {
    // Compared case-insensitively: User.email and Person.email are independent
    // columns, so the same human can be stored with different casing in each and
    // would otherwise receive both the mention and the team email.
    const alreadyEmailed = new Set(mentionRecipients.map((e) => e.toLowerCase()));
    if (session.user.email) alreadyEmailed.add(session.user.email.toLowerCase());
    const teamRecipients = collectEmails(
      parent.assignments,
      storyParent?.visuals ?? []
    ).filter((email) => !alreadyEmailed.has(email.toLowerCase()));
    if (teamRecipients.length > 0) {
      notifyCommentTeam({ ...notification, recipients: teamRecipients }).catch((err) =>
        console.error("notifyCommentTeam failed:", err)
      );
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
