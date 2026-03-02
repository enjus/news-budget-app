import type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment, Prisma } from "@prisma/client";

export type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment };

// ─── Story types ─────────────────────────────────────────────────────────────

export type StoryWithRelations = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { include: { person: true } };
    videos: true;
  };
}>;

// ─── Video types ─────────────────────────────────────────────────────────────

export type VideoWithRelations = Prisma.VideoGetPayload<{
  include: {
    assignments: { include: { person: true } };
    story: { select: { id: true; slug: true; budgetLine: true } };
  };
}>;

// ─── Person types ─────────────────────────────────────────────────────────────

export type PersonWithCounts = Prisma.PersonGetPayload<{
  include: {
    _count: { select: { assignments: true; videoAssignments: true } };
  };
}>;

export type AssignmentWithPerson = Prisma.StoryAssignmentGetPayload<{
  include: { person: true };
}>;

export type VideoAssignmentWithPerson = Prisma.VideoAssignmentGetPayload<{
  include: { person: true };
}>;

export type VisualWithPerson = Prisma.VisualGetPayload<{
  include: { person: true };
}>;

// ─── Budget view types ────────────────────────────────────────────────────────

export type ContentItem =
  | { type: "story"; item: StoryWithRelations }
  | { type: "video"; item: VideoWithRelations };

export type DailyBudgetSlot = {
  slot: string; // TIME_SLOTS value
  stories: StoryWithRelations[];
  videos: VideoWithRelations[];
};

export type EnterpriseDateGroup = {
  date: string; // YYYY-MM-DD or "TBD"
  stories: StoryWithRelations[];
  videos: VideoWithRelations[];
};
