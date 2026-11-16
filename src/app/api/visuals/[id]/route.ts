import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateVisualSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";
import { canActOnVisual, canBeAssigned, canTransition, type VisualAction } from "@/lib/visual-requests";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// Fields that only mean something on a request, not on a PLANNED credit.
const REQUEST_ONLY_FIELDS = ["priority", "eventDateTime", "location", "deadline", "notes", "dataUrl"] as const;

// The lifecycle action a status change needs (ASSIGNED is covered by "assign").
const ACTION_FOR_STATUS: Partial<Record<string, VisualAction>> = {
  ASSIGNED: "assign",
  IN_PROGRESS: "advance",
  DELIVERED: "advance",
  DECLINED: "decline",
  CANCELED: "cancel",
};

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const { id } = await params;

    const existing = await prisma.visual.findUnique({
      where: { id },
      select: { id: true, status: true, personId: true, requestedById: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateVisualSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const input = result.data;
    const isPlanned = existing.status === "PLANNED";

    if (isPlanned) {
      // A PLANNED credit has no lifecycle and none of the request fields.
      const requestOnly = [...REQUEST_ONLY_FIELDS, "status", "declineReason"].filter(
        (f) => (input as Record<string, unknown>)[f] !== undefined
      );
      if (requestOnly.length > 0) {
        return NextResponse.json(
          { error: `${requestOnly.join(", ")} can't be set on a planned visual` },
          { status: 400 }
        );
      }
    }

    const assigning = input.personId !== undefined && input.personId !== existing.personId;

    // Assignment on a request: only REQUESTED/ASSIGNED can be (re)assigned, and the
    // assignee can't be cleared (a request has no "unassign" transition).
    if (!isPlanned && assigning) {
      if (existing.status !== "REQUESTED" && existing.status !== "ASSIGNED") {
        return NextResponse.json(
          { error: `The assignee can't be changed while the request is ${existing.status}` },
          { status: 409 }
        );
      }
      if (input.personId === null) {
        return NextResponse.json({ error: "A request's assignee can't be cleared; reassign or decline it" }, { status: 400 });
      }
    }

    // Moving a request out of REQUESTED needs an assignee, in this payload or already set.
    let nextStatus = input.status;
    if (!isPlanned && existing.status === "REQUESTED" && assigning && nextStatus === undefined) {
      nextStatus = "ASSIGNED"; // assigning a REQUESTED visual is the REQUESTED → ASSIGNED transition
    }
    if (nextStatus === "ASSIGNED" && existing.status === "REQUESTED" && !(input.personId ?? existing.personId)) {
      return NextResponse.json({ error: "personId is required to assign a request" }, { status: 400 });
    }

    const transitioning = nextStatus !== undefined && nextStatus !== existing.status;
    if (transitioning && !canTransition(existing.status, nextStatus!)) {
      return NextResponse.json(
        { error: `A ${existing.status} visual can't move to ${nextStatus}` },
        { status: 409 }
      );
    }

    // Permissions: every action the payload implies must be allowed.
    const actor = { role: session.user.appRole, personId: session.user.personId ?? null };
    const actions = new Set<VisualAction>();
    const editsDetails = (
      ["type", "description", ...REQUEST_ONLY_FIELDS] as const
    ).some((f) => (input as Record<string, unknown>)[f] !== undefined);
    if (editsDetails) actions.add("update");
    if (assigning) actions.add("assign");
    if (transitioning) {
      const action = ACTION_FOR_STATUS[nextStatus!];
      if (action) actions.add(action);
    }
    for (const action of actions) {
      if (!canActOnVisual(actor, existing, action)) {
        return NextResponse.json({ error: "Not authorized to change this visual" }, { status: 403 });
      }
    }

    // Only a *new* assignee is checked: someone already on the row who has since been
    // deactivated stays put (their history is kept), they just can't be assigned again.
    if (assigning && input.personId) {
      const person = await prisma.person.findUnique({
        where: { id: input.personId },
        select: { isActive: true },
      });
      const assignable = canBeAssigned(person);
      if (!assignable.ok) {
        return NextResponse.json({ error: assignable.error }, { status: 400 });
      }
    }

    // Build update data, including explicit null where the payload clears a field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.description !== undefined) data.description = input.description;
    if (assigning) data.personId = input.personId;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.location !== undefined) data.location = input.location;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.dataUrl !== undefined) data.dataUrl = input.dataUrl;
    if (input.eventDateTime !== undefined) data.eventDateTime = input.eventDateTime ? new Date(input.eventDateTime) : null;
    if (input.deadline !== undefined) data.deadline = input.deadline ? new Date(input.deadline) : null;
    if (transitioning) data.status = nextStatus;
    if (nextStatus === "DECLINED") data.declineReason = input.declineReason!.trim();

    // Guard on the status and assignee we validated against, so two racing transitions
    // or reassignments can't both win.
    const updated = await prisma.visual.updateMany({
      where: { id, status: existing.status, personId: existing.personId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "This visual was changed by someone else. Please reload." }, { status: 409 });
    }

    const visual = await prisma.visual.findUnique({ where: { id }, include: { person: true } });
    return NextResponse.json(visual);
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }
    console.error("PATCH /api/visuals/[id] error:", error);
    return NextResponse.json({ error: "Failed to update visual" }, { status: 500 });
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

    const existingVisual = await prisma.visual.findUnique({
      where: { id },
      select: { id: true, status: true, personId: true, requestedById: true },
    });
    if (!existingVisual) {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }

    const actor = { role: session.user.appRole, personId: session.user.personId ?? null };
    if (!canActOnVisual(actor, existingVisual, "delete")) {
      return NextResponse.json(
        { error: "Only an admin can delete a request, and only once it is delivered, declined or canceled" },
        { status: 403 }
      );
    }

    await prisma.visual.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (prismaErrorCode(error) === "P2025") {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }
    console.error("DELETE /api/visuals/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete visual" }, { status: 500 });
  }
}
