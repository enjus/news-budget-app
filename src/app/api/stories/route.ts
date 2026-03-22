import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStorySchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";

export const dynamic = 'force-dynamic'

let lastShelvedPurge = 0
const PURGE_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

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

      // Fire-and-forget purge of stories shelved >90 days, rate-limited to once/hour
      if (status === "SHELVED" && Date.now() - lastShelvedPurge > PURGE_INTERVAL_MS) {
        lastShelvedPurge = Date.now()
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        prisma.story.deleteMany({
          where: { status: "SHELVED", shelvedAt: { lte: cutoff } },
        }).catch((err) => console.error("Shelved story purge error:", err));
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
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const result = createStorySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { onlinePubDate, printPubDate, ...rest } = result.data;

    // If TBD is false but no date provided, revert to TBD
    const onlineTBD = rest.onlinePubDateTBD || !onlinePubDate;
    const printTBD = rest.printPubDateTBD || !printPubDate;

    const story = await prisma.story.create({
      data: {
        ...rest,
        onlinePubDateTBD: onlineTBD,
        onlinePubDate: onlineTBD ? null : new Date(onlinePubDate!),
        printPubDateTBD: printTBD,
        printPubDate: printTBD ? null : new Date(printPubDate!),
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
