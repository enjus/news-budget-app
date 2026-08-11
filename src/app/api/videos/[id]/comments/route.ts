import { NextRequest, NextResponse } from "next/server";
import { createComment, listComments } from "@/lib/comments";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: videoId } = await params;
    return await listComments("video", videoId);
  } catch (error) {
    console.error("GET /api/videos/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: videoId } = await params;
    return await createComment("video", request, videoId);
  } catch (error) {
    console.error("POST /api/videos/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
