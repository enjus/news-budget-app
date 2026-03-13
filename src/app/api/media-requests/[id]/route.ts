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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const isAdmin = session.user.appRole === "ADMIN";
    const isEditor = session.user.appRole === "EDITOR";

    // Only admins and editors can decline
    if (rest.status === "DECLINED") {
      if (!isAdmin && !isEditor) {
        return NextResponse.json({ error: "Not authorized to decline requests" }, { status: 403 });
      }
      if (!rest.declineReason) {
        return NextResponse.json(
          { error: "Decline reason is required when declining a request" },
          { status: 400 }
        );
      }
    }

    // Only the requester or admin can cancel
    if (rest.status === "CANCELED") {
      const existing = await prisma.mediaRequest.findUnique({
        where: { id },
        select: { requestedById: true },
      });
      const isRequester = existing?.requestedById === session.user.personId;
      if (!isAdmin && !isRequester) {
        return NextResponse.json({ error: "Not authorized to cancel this request" }, { status: 403 });
      }
    }

    // Only admins and editors can archive/unarchive
    if (rest.archived !== undefined && !isAdmin && !isEditor) {
      return NextResponse.json({ error: "Not authorized to archive requests" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...rest };
    if (eventDateTime !== undefined) {
      data.eventDateTime = eventDateTime ? new Date(eventDateTime) : null;
    }
    if (deadline !== undefined) {
      data.deadline = deadline ? new Date(deadline) : null;
    }

    // Archive: set archivedAt timestamp
    if (rest.archived === true) {
      data.archivedAt = new Date();
    }

    // Unarchive a declined/canceled request: reset to REQUESTED so it re-enters the queue
    if (rest.archived === false) {
      data.archivedAt = null;
      const existing = await prisma.mediaRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (existing && ["DECLINED", "CANCELED"].includes(existing.status)) {
        data.status = "REQUESTED";
        data.declineReason = null;
      }
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
    const isAdmin = session.user.appRole === "ADMIN";
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can delete requests" }, { status: 403 });
    }

    const mediaRequest = await prisma.mediaRequest.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!mediaRequest) {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }

    // Delete only allowed on terminal statuses
    if (!["DECLINED", "CANCELED"].includes(mediaRequest.status)) {
      return NextResponse.json(
        { error: "Only declined or canceled requests can be deleted" },
        { status: 400 }
      );
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
