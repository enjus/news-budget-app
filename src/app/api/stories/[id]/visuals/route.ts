import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVisualSchema, requestVisualSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { CREATABLE_STATUSES } from "@/lib/visual-requests";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const visuals = await prisma.visual.findMany({
      where: { storyId },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(visuals);
  } catch (error) {
    console.error("GET /api/stories/[id]/visuals error:", error);
    return NextResponse.json({ error: "Failed to fetch visuals" }, { status: 500 });
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

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const { id: storyId } = await params;
    const body = await request.json();

    // "Add" files a PLANNED visual (no status in the body); "Request" files a REQUESTED one.
    const status = body?.status ?? "PLANNED";
    if (!CREATABLE_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${CREATABLE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const isRequest = status === "REQUESTED";

    // The requester is recorded from the session, so the account must be linked to a Person.
    if (isRequest && !session.user.personId) {
      return NextResponse.json(
        { error: "Your account isn't linked to a Person yet. Ask an admin to link it before filing a visual request." },
        { status: 400 }
      );
    }

    const result = isRequest ? requestVisualSchema.safeParse(body) : createVisualSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    let visual;
    if (result.data && "status" in result.data) {
      // REQUESTED: no assignee yet; requestedById comes from the session, never the body.
      const d = result.data;
      visual = await prisma.visual.create({
        data: {
          storyId,
          status: "REQUESTED",
          requestedById: session.user.personId,
          type: d.type,
          description: d.description ?? null,
          priority: d.priority,
          eventDateTime: d.eventDateTime ? new Date(d.eventDateTime) : null,
          location: d.location ?? null,
          deadline: d.deadline ? new Date(d.deadline) : null,
          notes: d.notes ?? null,
          dataUrl: d.dataUrl ?? null,
        },
        include: { person: true },
      });
    } else {
      const d = result.data;
      if (d.personId) {
        const person = await prisma.person.findUnique({ where: { id: d.personId } });
        if (!person) {
          return NextResponse.json({ error: "Person not found" }, { status: 404 });
        }
      }
      visual = await prisma.visual.create({
        data: {
          storyId,
          type: d.type,
          description: d.description ?? null,
          personId: d.personId ?? null,
        },
        include: { person: true },
      });
    }

    return NextResponse.json(visual, { status: 201 });
  } catch (error) {
    console.error("POST /api/stories/[id]/visuals error:", error);
    return NextResponse.json({ error: "Failed to create visual" }, { status: 500 });
  }
}
