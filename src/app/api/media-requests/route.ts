import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMediaRequestSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

const listInclude = {
  assignments: { include: { person: true } },
  requestedBy: { select: { id: true, name: true } },
  story: { select: { id: true, slug: true } },
} as const;

const SPECIALIST_ROLES = ["PHOTOGRAPHER", "VIDEOGRAPHER", "GRAPHIC_DESIGNER"];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const assigneeId = searchParams.get("assigneeId");
    const requestedById = searchParams.get("requestedById");
    const storyId = searchParams.get("storyId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Access control: specialists + admins see all; others see only their own
    const isAdmin = session.user.appRole === "ADMIN";
    let isSpecialist = false;
    if (session.user.personId) {
      const person = await prisma.person.findUnique({
        where: { id: session.user.personId },
        select: { defaultRole: true },
      });
      if (person && SPECIALIST_ROLES.includes(person.defaultRole)) {
        isSpecialist = true;
      }
    }

    if (!isAdmin && !isSpecialist) {
      where.requestedById = session.user.personId ?? "__none__";
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (requestedById) where.requestedById = requestedById;
    if (storyId) where.storyId = storyId;
    if (assigneeId) {
      where.assignments = { some: { personId: assigneeId } };
    }

    const requests = await prisma.mediaRequest.findMany({
      where,
      include: listInclude,
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("GET /api/media-requests error:", error);
    return NextResponse.json({ error: "Failed to fetch media requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = createMediaRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { eventDateTime, deadline, ...rest } = result.data;

    const mediaRequest = await prisma.mediaRequest.create({
      data: {
        ...rest,
        eventDateTime: eventDateTime ? new Date(eventDateTime) : null,
        deadline: deadline ? new Date(deadline) : null,
      },
      include: {
        assignments: { include: { person: true } },
        dataLinks: true,
        story: { select: { id: true, slug: true, budgetLine: true } },
        requestedBy: true,
      },
    });

    return NextResponse.json(mediaRequest, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Referenced person or story not found" }, { status: 404 });
    }
    console.error("POST /api/media-requests error:", error);
    return NextResponse.json({ error: "Failed to create media request" }, { status: 500 });
  }
}
