import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateStorySchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const story = await prisma.story.findUnique({
      where: { id },
      include: storyInclude,
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    return NextResponse.json(story);
  } catch (error) {
    console.error("GET /api/stories/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch story" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = updateStorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, printPubDate, ...rest } = result.data;

    // Build the update data, only including date fields if they were provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...rest };

    // If TBD is false but no date provided, revert to TBD
    if (onlinePubDate !== undefined || rest.onlinePubDateTBD !== undefined) {
      const onlineTBD = rest.onlinePubDateTBD || !onlinePubDate;
      data.onlinePubDateTBD = onlineTBD;
      data.onlinePubDate = onlineTBD ? null : new Date(onlinePubDate!);
    }
    if (printPubDate !== undefined || rest.printPubDateTBD !== undefined) {
      const printTBD = rest.printPubDateTBD || !printPubDate;
      data.printPubDateTBD = printTBD;
      data.printPubDate = printTBD ? null : new Date(printPubDate!);
    }

    // Track when a story is shelved for the 90-day auto-deletion clock
    if (rest.status === "SHELVED") {
      const existing = await prisma.story.findUnique({ where: { id }, select: { status: true } });
      if (existing && existing.status !== "SHELVED") {
        data.shelvedAt = new Date();
      }
    } else if (rest.status !== undefined) {
      // Moving out of SHELVED — reset the clock
      data.shelvedAt = null;
    }

    const story = await prisma.story.update({
      where: { id },
      data,
      include: storyInclude,
    });

    return NextResponse.json(story);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A story with that slug already exists" }, { status: 409 });
    }
    console.error("PATCH /api/stories/[id] error:", error);
    return NextResponse.json({ error: "Failed to update story" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    await prisma.story.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    console.error("DELETE /api/stories/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
}
