import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPitchSchema } from "@/lib/validations";
import { canCreateContent, deriveSlug } from "@/lib/utils";
import { checkWriteLimit, requireJSON } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic'

/** File a pitch: one field, server-derives everything else. See issue #24 §5. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !canCreateContent(session.user.appRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const limited = checkWriteLimit(session.user.id);
    if (limited) return limited;

    const invalidType = requireJSON(request);
    if (invalidType) return invalidType;

    const body = await request.json();
    const result = createPitchSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { text, notes, evergreen, expiresAt } = result.data;
    const pitchedAt = new Date();
    const resolvedExpiresAt = evergreen ? null : (expiresAt ? new Date(expiresAt) : addDays(pitchedAt, 30));

    const story = await prisma.story.create({
      data: {
        slug: deriveSlug(text, pitchedAt),
        budgetLine: text,
        pitchText: text,
        notes: notes ?? null,
        pitchedAt,
        expiresAt: resolvedExpiresAt,
        createdByUserId: session.user.id,
        onBudget: false,
        status: "DRAFT",
        onlinePubDateTBD: true,
      },
      select: { id: true },
    });

    return NextResponse.json(story, { status: 201 });
  } catch (error) {
    console.error("POST /api/pitches error:", error);
    return NextResponse.json({ error: "Failed to file pitch" }, { status: 500 });
  }
}
