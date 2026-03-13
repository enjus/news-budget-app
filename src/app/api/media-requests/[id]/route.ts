import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMediaRequestSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const fullInclude = {
  assignments: { include: { person: true } },
  dataLinks: true,
  story: { select: { id: true, slug: true, budgetLine: true } },
  requestedBy: true,
} as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id },
      include: fullInclude,
    });

    if (!mediaRequest) {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }

    return NextResponse.json(mediaRequest);
  } catch (error) {
    console.error("GET /api/media-requests/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch media request" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = updateMediaRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { eventDateTime, deadline, ...rest } = result.data;

    // If setting DECLINED, require declineReason
    if (rest.status === "DECLINED" && !rest.declineReason) {
      return NextResponse.json(
        { error: "Decline reason is required when declining a request" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...rest };
    if (eventDateTime !== undefined) {
      data.eventDateTime = eventDateTime ? new Date(eventDateTime) : null;
    }
    if (deadline !== undefined) {
      data.deadline = deadline ? new Date(deadline) : null;
    }

    const mediaRequest = await prisma.mediaRequest.update({
      where: { id },
      data,
      include: fullInclude,
    });

    return NextResponse.json(mediaRequest);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }
    console.error("PATCH /api/media-requests/[id] error:", error);
    return NextResponse.json({ error: "Failed to update media request" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id },
      select: { requestedById: true },
    });

    if (!mediaRequest) {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }

    // Only requester or admin can delete
    const isAdmin = session.user.appRole === "ADMIN";
    const isRequester = mediaRequest.requestedById === session.user.personId;
    if (!isAdmin && !isRequester) {
      return NextResponse.json({ error: "Not authorized to delete this request" }, { status: 403 });
    }

    await prisma.mediaRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }
    console.error("DELETE /api/media-requests/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete media request" }, { status: 500 });
  }
}
