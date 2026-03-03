import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVisualSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;

    const story = await prisma.story.findUnique({ where: { id: storyId } });
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
    const { id: storyId } = await params;
    const body = await request.json();
    const result = createVisualSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (result.data.personId) {
      const person = await prisma.person.findUnique({ where: { id: result.data.personId } });
      if (!person) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
    }

    const visual = await prisma.visual.create({
      data: {
        storyId,
        type: result.data.type,
        description: result.data.description ?? null,
        personId: result.data.personId ?? null,
      },
      include: { person: true },
    });

    return NextResponse.json(visual, { status: 201 });
  } catch (error) {
    console.error("POST /api/stories/[id]/visuals error:", error);
    return NextResponse.json({ error: "Failed to create visual" }, { status: 500 });
  }
}
