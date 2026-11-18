import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestVisualSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkReadLimit, checkWriteLimit, requireJSON } from "@/lib/api-helpers";
import { visualRequestCreateData } from "@/lib/visual-requests";
import { REQUEST_LIST_CAP, compareRequests, parseRequestListQuery } from "@/lib/visual-request-list";
import { notifyVisualDesk } from "@/lib/visual-notifications";

export const dynamic = 'force-dynamic'

// Explicit select, like the Pitches pool: notes can carry a source's contact
// details and dataUrl is a link into someone's files, so both load only on the
// request page (GET /api/visuals/[id]), not in every dashboard row.
const listSelect = {
  id: true,
  type: true,
  status: true,
  priority: true,
  description: true,
  eventDateTime: true,
  location: true,
  deadline: true,
  declineReason: true,
  createdAt: true,
  updatedAt: true,
  person: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  story: { select: { id: true, slug: true, budgetLine: true } },
} as const;

/**
 * The /requests dashboard list (issue #23, slice 3). Any signed-in user may
 * read requests. Filters are parsed by parseRequestListQuery
 * (src/lib/visual-request-list.ts); PLANNED credits are never listed.
 * Response: `{ requests, truncated }`.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    const limited = checkReadLimit(session.user.id);
    if (limited) return limited;

    const parsed = parseRequestListQuery(new URL(request.url).searchParams, {
      personId: session.user.personId ?? null,
      now: new Date(),
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.where === null) {
      return NextResponse.json({ requests: [], truncated: false });
    }

    // One past the cap tells us whether there was more. If the cap is hit, keep
    // the most recently touched rows; the dashboard order is applied after.
    const rows = await prisma.visual.findMany({
      where: parsed.where,
      select: listSelect,
      orderBy: { updatedAt: "desc" },
      take: REQUEST_LIST_CAP + 1,
    });
    const truncated = rows.length > REQUEST_LIST_CAP;
    const requests = rows.slice(0, REQUEST_LIST_CAP).sort(compareRequests);

    return NextResponse.json({ requests, truncated });
  } catch (error) {
    console.error("GET /api/visuals error:", error);
    return NextResponse.json({ error: "Failed to fetch visual requests" }, { status: 500 });
  }
}

/**
 * File a standalone request: REQUESTED with no story ("update our file photos
 * of the governor"). Attached to a story later through PATCH /api/visuals/[id].
 * Requests on a story go through POST /api/stories/[id]/visuals; both build the
 * row with visualRequestCreateData(). PLANNED can't be created here — a credit
 * with no story means nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const jsonError = requireJSON(request);
    if (jsonError) return jsonError;

    // The requester is recorded from the session, so the account must be linked to a Person.
    const requesterId = session.user.personId;
    if (!requesterId) {
      return NextResponse.json(
        { error: "Your account isn't linked to a Person yet. Ask an admin to link it before filing a visual request." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const result = requestVisualSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const visual = await prisma.visual.create({
      data: visualRequestCreateData(result.data, requesterId, null),
      include: {
        person: true,
        requestedBy: { select: { name: true } },
        story: { select: { id: true, slug: true, budgetLine: true } },
      },
    });

    // Fire-and-forget, like the story route: the request stands whether or not the desk hears.
    notifyVisualDesk(visual).catch((error) => console.error("Visual request desk email failed:", error));

    return NextResponse.json(visual, { status: 201 });
  } catch (error) {
    console.error("POST /api/visuals error:", error);
    return NextResponse.json({ error: "Failed to create visual request" }, { status: 500 });
  }
}
