import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDataLinkSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: mediaRequestId } = await params;
    const body = await request.json();
    const result = createDataLinkSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const mediaRequest = await prisma.mediaRequest.findUnique({ where: { id: mediaRequestId } });
    if (!mediaRequest) {
      return NextResponse.json({ error: "Media request not found" }, { status: 404 });
    }

    const dataLink = await prisma.dataLink.create({
      data: {
        mediaRequestId,
        ...result.data,
      },
    });

    return NextResponse.json(dataLink, { status: 201 });
  } catch (error) {
    console.error("POST /api/media-requests/[id]/data-links error:", error);
    return NextResponse.json({ error: "Failed to create data link" }, { status: 500 });
  }
}
