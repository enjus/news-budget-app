import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateVisualSchema } from "@/lib/validations";
import { canCreateContent } from "@/lib/utils";
import { checkWriteLimit } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const { id } = await params;
    const body = await request.json();
    const result = updateVisualSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (result.data.personId) {
      const person = await prisma.person.findUnique({ where: { id: result.data.personId } });
      if (!person) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
    }

    // Build update data, including explicit null for personId if provided as null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (result.data.type !== undefined) data.type = result.data.type;
    if (result.data.description !== undefined) data.description = result.data.description;
    if ("personId" in result.data) data.personId = result.data.personId ?? null;

    const visual = await prisma.visual.update({
      where: { id },
      data,
      include: { person: true },
    });

    return NextResponse.json(visual);
  } catch (error: any) {
    if (error?.code === "P2025") {
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

    await prisma.visual.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Visual not found" }, { status: 404 });
    }
    console.error("DELETE /api/visuals/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete visual" }, { status: 500 });
  }
}
