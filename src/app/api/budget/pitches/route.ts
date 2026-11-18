import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = 'force-dynamic'

// Explicit select, not include (departs from the other budget routes) — notes
// may carry a tipster's contact details, which have no business sitting in
// every browser's memory for every open pitch. It loads only on the detail
// view. Rows get a `hasNotes` flag instead, from a second id-only query, so
// the notes text (up to NOTES_MAX each, and this endpoint is polled) never
// leaves Postgres. Keep in sync with PitchListItem in src/types/index.ts.
const pitchSelect = {
  id: true,
  pitchText: true,
  expiresAt: true,
  pitchedAt: true,
  updatedAt: true,
  createdByUser: { select: { id: true, name: true } },
  assignments: { include: { person: { select: { id: true, name: true } } } },
} as const;

/** The Pitches pool: any onBudget:false story with pitchedAt set.
 *  Read access: any authenticated user (issue #24 §8). */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    // Excludes SHELVED: the purge-shelved cron auto-shelves expired pitches
    // but deliberately leaves pitchedAt set (so they're recoverable via the
    // story detail page's unarchive flow) rather than clearing it. Without
    // this filter those archived pitches would keep showing here as if
    // still active and claimable.
    const where: Prisma.StoryWhereInput = { onBudget: false, pitchedAt: { not: null }, status: { not: "SHELVED" } };

    const [pitches, withNotes] = await Promise.all([
      prisma.story.findMany({ where, select: pitchSelect, orderBy: { pitchedAt: "desc" } }),
      prisma.story.findMany({
        where: { ...where, AND: [{ notes: { not: null } }, { notes: { not: "" } }] },
        select: { id: true },
      }),
    ]);

    const noted = new Set(withNotes.map((s) => s.id));
    const items = pitches.map((p) => ({ ...p, hasNotes: noted.has(p.id) }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/budget/pitches error:", error);
    return NextResponse.json({ error: "Failed to fetch pitches" }, { status: 500 });
  }
}
