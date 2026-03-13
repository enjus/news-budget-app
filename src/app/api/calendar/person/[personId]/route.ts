import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ personId: string }> };

function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { personId } = await params;

    // Auth via token query param
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return new NextResponse("Missing token", { status: 401 });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, calendarToken: true },
    });

    if (!person || person.calendarToken !== token) {
      return new NextResponse("Invalid token", { status: 403 });
    }

    // Find media requests assigned to this person with eventDateTime
    const assignments = await prisma.mediaAssignment.findMany({
      where: { personId },
      include: {
        mediaRequest: {
          include: {
            story: { select: { slug: true } },
          },
        },
      },
    });

    const events = assignments
      .filter((a) => a.mediaRequest.eventDateTime)
      .filter((a) => ["PHOTO", "VIDEO", "PHOTO_VIDEO"].includes(a.mediaRequest.type));

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//News Budget//Media Requests//EN",
      `X-WR-CALNAME:${escapeIcal(person.name)} - Media Assignments`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const a of events) {
      const mr = a.mediaRequest;
      const start = new Date(mr.eventDateTime!);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default
      const summary = mr.story ? `${mr.title} (${mr.story.slug})` : mr.title;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${mr.id}@newsbudget`);
      lines.push(`DTSTART:${icalDate(start)}`);
      lines.push(`DTSTAMP:${icalDate(new Date())}`);
      lines.push(`DTEND:${icalDate(end)}`);
      lines.push(`SUMMARY:${escapeIcal(summary)}`);
      if (mr.location) lines.push(`LOCATION:${escapeIcal(mr.location)}`);
      if (mr.description) lines.push(`DESCRIPTION:${escapeIcal(mr.description)}`);
      if (mr.priority === "URGENT") lines.push("PRIORITY:1");
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${person.name.replace(/\s+/g, "_")}_calendar.ics"`,
      },
    });
  } catch (error) {
    console.error("GET /api/calendar/person/[personId] error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
