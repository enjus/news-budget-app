import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const type = searchParams.get("type"); // optional filter

    if (!token) {
      return new NextResponse("Missing token", { status: 401 });
    }

    // Validate token against any person's calendarToken
    const person = await prisma.person.findFirst({
      where: { calendarToken: token },
      select: { id: true },
    });

    if (!person) {
      return new NextResponse("Invalid token", { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      eventDateTime: { not: null },
      type: { in: type ? [type] : ["PHOTO", "VIDEO", "PHOTO_VIDEO"] },
    };

    const mediaRequests = await prisma.mediaRequest.findMany({
      where,
      include: {
        assignments: { include: { person: { select: { name: true } } } },
        story: { select: { slug: true } },
      },
      orderBy: { eventDateTime: "asc" },
    });

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//News Budget//Media Requests Team//EN",
      "X-WR-CALNAME:Media Requests - Team Calendar",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const mr of mediaRequests) {
      const start = new Date(mr.eventDateTime!);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const summary = mr.story ? `${mr.title} (${mr.story.slug})` : mr.title;
      const assignees = mr.assignments.map((a) => a.person.name).join(", ");

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${mr.id}@newsbudget`);
      lines.push(`DTSTART:${icalDate(start)}`);
      lines.push(`DTSTAMP:${icalDate(new Date())}`);
      lines.push(`DTEND:${icalDate(end)}`);
      lines.push(`SUMMARY:${escapeIcal(summary)}`);
      if (mr.location) lines.push(`LOCATION:${escapeIcal(mr.location)}`);
      const desc = [mr.description, assignees ? `Assigned: ${assignees}` : null].filter(Boolean).join("\\n");
      if (desc) lines.push(`DESCRIPTION:${escapeIcal(desc)}`);
      if (mr.priority === "URGENT") lines.push("PRIORITY:1");
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="team_calendar.ics"',
      },
    });
  } catch (error) {
    console.error("GET /api/calendar/team error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
