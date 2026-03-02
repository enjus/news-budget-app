import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStorySchema } from "@/lib/validations";

const storyInclude = {
  assignments: { include: { person: true } },
  visuals: { include: { person: true } },
  videos: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const enterprise = searchParams.get("enterprise");
    const date = searchParams.get("date");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      // Explicit status filter — show exactly that status (including SHELVED if requested)
      where.status = status;

      // When fetching shelved items, first auto-delete any that exceeded 90 days
      if (status === "SHELVED") {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await prisma.story.deleteMany({
          where: { status: "SHELVED", shelvedAt: { lte: cutoff } },
        });
      }
    } else {
      // Default: exclude SHELVED
      where.status = { not: "SHELVED" };
    }

    if (enterprise === "true") {
      where.isEnterprise = true;
    }

    if (date) {
      // Filter by calendar date on onlinePubDate
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      where.onlinePubDate = {
        gte: dayStart,
        lte: dayEnd,
      };
    }

    const stories = await prisma.story.findMany({
      where,
      include: storyInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(stories);
  } catch (error) {
    console.error("GET /api/stories error:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = createStorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, printPubDate, ...rest } = result.data;

    const story = await prisma.story.create({
      data: {
        ...rest,
        onlinePubDate: onlinePubDate ? new Date(onlinePubDate) : null,
        printPubDate: printPubDate ? new Date(printPubDate) : null,
      },
      include: storyInclude,
    });

    return NextResponse.json(story, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A story with that slug already exists" }, { status: 409 });
    }
    console.error("POST /api/stories error:", error);
    return NextResponse.json({ error: "Failed to create story" }, { status: 500 });
  }
}
