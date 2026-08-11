import { NextRequest, NextResponse } from "next/server";
import { createComment, listComments } from "@/lib/comments";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;
    return await listComments("story", storyId);
  } catch (error) {
    console.error("GET /api/stories/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: storyId } = await params;
    return await createComment("story", request, storyId);
  } catch (error) {
    console.error("POST /api/stories/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
