import type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment, Team, TeamMember, Prisma } from "@prisma/client";

export type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment, Team, TeamMember };

// ─── Story types ─────────────────────────────────────────────────────────────

// Full relations — used by detail pages (story/[id], edit forms, etc.)
export type StoryWithRelations = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { include: { person: true } };
    videos: true;
  };
}>;

// Lightweight shape for budget list views (cards).
// Omits visuals.person (cards only need visual.type for photo/graphic count).
// Includes a minimal videos relation so cards can display a video count.
export type StoryListItem = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { select: { id: true; type: true } };
    videos: { select: { id: true } };
  };
}>;

// Alias kept for any consumers that referenced EnterpriseStoryItem directly.
export type EnterpriseStoryItem = StoryListItem;

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
  | { type: "story"; item: StoryListItem }
  | { type: "video"; item: VideoWithRelations };

export type DailyBudgetSlot = {
  slot: string; // TIME_BUCKETS id
  stories: StoryListItem[];
  videos: VideoWithRelations[];
};

export type EnterpriseDateGroup = {
  date: string; // YYYY-MM-DD or "TBD"
  stories: EnterpriseStoryItem[];
  videos: VideoWithRelations[];
};

export type EditionDateGroup = {
  date: string; // YYYY-MM-DD or "TBD"
  stories: StoryListItem[];
};

// ─── Team types ──────────────────────────────────────────────────────────────

export type TeamWithMembers = Prisma.TeamGetPayload<{
  include: {
    members: { include: { person: true } };
  };
}>;

export type TeamListItem = Prisma.TeamGetPayload<{
  include: {
    _count: { select: { members: true } };
  };
}>;
