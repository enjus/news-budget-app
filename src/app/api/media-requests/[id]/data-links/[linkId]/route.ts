import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; linkId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: _mediaRequestId, linkId } = await params;

    await prisma.dataLink.delete({ where: { id: linkId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Data link not found" }, { status: 404 });
    }
    console.error("DELETE /api/media-requests/[id]/data-links/[linkId] error:", error);
    return NextResponse.json({ error: "Failed to delete data link" }, { status: 500 });
  }
}
