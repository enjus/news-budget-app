import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateVisualSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { notifyRequesterOfOutcome } from "@/lib/visual-requester-notify-server";
import { checkReadLimit, checkWriteLimit, requireJSON, prismaErrorCode } from "@/lib/api-helpers";
import {
  canActOnVisual,
  canBeAssigned,
  canTransition,
  isAttachableStatus,
  visualPatchGuard,
  isTerminalStatus,
  VISUAL_STATUS_LABELS,
  type VisualAction,
  type VisualStatus,
} from "@/lib/visual-requests";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

// Fields that only mean something on a request, not on a PLANNED credit.
const REQUEST_ONLY_FIELDS = ["priority", "eventDateTime", "location", "deadline", "notes", "dataUrl"] as const;

// The lifecycle action a status change needs (ASSIGNED is covered by "assign";
// REQUESTED can only be reached from ASSIGNED, which is a release).
const ACTION_FOR_STATUS: Partial<Record<string, VisualAction>> = {
  REQUESTED: "release",
  ASSIGNED: "assign",
  IN_PROGRESS: "advance",
  DELIVERED: "advance",
  DECLINED: "decline",
  CANCELED: "cancel",
};

// What a PATCH returns: the row as VisualSection expects it (person), plus the
// requester and story the request page shows.
const patchInclude = {
  person: true,
  requestedBy: { select: { id: true, name: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

/**
 * One request, in full, for its page (/requests/[id]). Any signed-in user may
 * read it. Unlike the dashboard list, this includes notes and dataUrl.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const visual = await prisma.visual.findUnique({
      where: { id },
      select: {
        id: true,
        storyId: true,
        type: true,
        status: true,
        priority: true,
        description: true,
        eventDateTime: true,
        location: true,
        deadline: true,
        notes: true,
        dataUrl: true,
        declineReason: true,
        personId: true,
        requestedById: true,
        createdAt: true,
        updatedAt: true,
        person: { select: { id: true, name: true, isActive: true } },
        requestedBy: { select: { id: true, name: true } },
        story: {
          select: { id: true, slug: true, budgetLine: true, onlinePubDate: true, onlinePubDateTBD: true, status: true },
        },
      },
    });
    if (!visual) {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }
    return NextResponse.json(visual);
  } catch (error) {
    console.error("GET /api/visuals/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch visual" }, { status: 500 });
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

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    const { id } = await params;

    const existing = await prisma.visual.findUnique({
      where: { id },
      select: { id: true, status: true, personId: true, requestedById: true, storyId: true },
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
      const requestOnly = [...REQUEST_ONLY_FIELDS, "status", "declineReason", "storyId"].filter(
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

    // Release (ASSIGNED → REQUESTED) clears the assignee, so it can't also set one.
    const releasing = transitioning && nextStatus === "REQUESTED";
    if (releasing && input.personId !== undefined) {
      return NextResponse.json(
        { error: "Releasing a request clears its assignee; don't send personId with it" },
        { status: 400 }
      );
    }

    // A finished request's details are locked (canActOnVisual's "update" rule
    // says the same; this gives the clearer 409). Attaching isn't a detail edit:
    // a DELIVERED request can still be placed on a story.
    const editsDetails = (
      ["type", "description", ...REQUEST_ONLY_FIELDS] as const
    ).some((f) => (input as Record<string, unknown>)[f] !== undefined);
    if (!isPlanned && editsDetails && isTerminalStatus(existing.status)) {
      const label = VISUAL_STATUS_LABELS[existing.status as VisualStatus].toLowerCase();
      return NextResponse.json(
        { error: `A ${label} request's details can't be changed` },
        { status: 409 }
      );
    }

    // Attach to a story, or move to another one. No detaching: the schema
    // rejects null. Sending the story it's already on is a no-op.
    const attaching = input.storyId !== undefined && input.storyId !== existing.storyId;
    if (attaching) {
      const statusAfter = transitioning ? nextStatus! : existing.status;
      if (!isAttachableStatus(existing.status) || !isAttachableStatus(statusAfter)) {
        return NextResponse.json(
          { error: "A declined or canceled request can't be attached to a story" },
          { status: 409 }
        );
      }
    }

    // Permissions: every action the payload implies must be allowed.
    const actor = { role: session.user.appRole, personId: session.user.personId ?? null };
    const actions = new Set<VisualAction>();
    if (editsDetails) actions.add("update");
    if (assigning) actions.add("assign");
    if (attaching) actions.add("attach");
    if (transitioning) {
      const action = ACTION_FOR_STATUS[nextStatus!];
      if (action) actions.add(action);
    }
    for (const action of actions) {
      // For "assign", the target matters: non-elevated users may only claim for themselves.
      if (!canActOnVisual(actor, existing, action, action === "assign" ? input.personId : undefined)) {
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

    if (attaching) {
      const story = await prisma.story.findUnique({
        where: { id: input.storyId! },
        select: { status: true },
      });
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
      if (story.status === "SHELVED") {
        return NextResponse.json({ error: "A request can't be attached to a shelved story" }, { status: 400 });
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
    if (attaching) data.storyId = input.storyId;
    if (releasing) data.personId = null;
    if (transitioning) data.status = nextStatus;
    if (nextStatus === "DECLINED") data.declineReason = input.declineReason!.trim();

    // Guard on the status, assignee and story we validated against, so two racing
    // claims, transitions, reassignments or attaches can't both win (the loser gets 409).
    const updated = await prisma.visual.updateMany({
      where: visualPatchGuard(existing),
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "This visual was changed by someone else. Please reload." }, { status: 409 });
    }

    // Decline and delivery tell the requester (slice 3, decision 2), after the
    // write commits. Fire-and-forget, like the other notifications: the change
    // stands whether or not the email goes.
    if (transitioning && (nextStatus === "DECLINED" || nextStatus === "DELIVERED")) {
      notifyRequesterOfOutcome(id, {
        personId: actor.personId,
        name: session.user.name ?? session.user.email ?? "a newsroom user",
      }).catch((error) => console.error("Visual request requester email failed:", error));
    }

    const visual = await prisma.visual.findUnique({ where: { id }, include: patchInclude });
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
