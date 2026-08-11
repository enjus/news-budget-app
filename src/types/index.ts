import type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment, Team, TeamMember, StoryTag, Prisma } from "@prisma/client";

export type { Story, Person, StoryAssignment, Visual, Video, VideoAssignment, Team, TeamMember, StoryTag };

// ─── Story types ─────────────────────────────────────────────────────────────

// Full relations — used by detail pages (story/[id], edit forms, etc.)
export type StoryWithRelations = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { include: { person: true } };
    videos: true;
    tags: true;
    comments: {
      include: {
        author: { select: { id: true; name: true; email: true } };
        mentions: { include: { person: { select: { id: true; name: true } } } };
      };
    };
  };
}>;

// What /api/stories (list) returns: full relations minus comments, which list
// views never render and which would mean shipping every comment body. Keep in
// sync with storyInclude in src/app/api/stories/route.ts.
export type StoryListRelations = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { include: { person: true } };
    videos: true;
    tags: true;
  };
}>;

// Lightweight shape for budget list views (cards).
// Omits visuals.person (cards only need visual.type for photo/graphic count).
// Includes a minimal videos relation so cards can display a video count.
export type StoryListItem = Prisma.StoryGetPayload<{
  include: {
    assignments: { include: { person: true } };
    visuals: { select: { id: true; type: true; person: { select: { name: true } } } };
    videos: { select: { id: true } };
    tags: true;
    _count: { select: { comments: true } };
  };
}>;

// Alias kept for any consumers that referenced EnterpriseStoryItem directly.
export type EnterpriseStoryItem = StoryListItem;

// ─── Video types ─────────────────────────────────────────────────────────────

export type VideoWithRelations = Prisma.VideoGetPayload<{
  include: {
    assignments: { include: { person: true } };
    story: { select: { id: true; slug: true; budgetLine: true } };
    _count: { select: { comments: true } };
  };
}>;

// Videos carry comments only on the detail page; list views get just the count.
export type VideoWithComments = Prisma.VideoGetPayload<{
  include: {
    assignments: { include: { person: true } };
    story: { select: { id: true; slug: true; budgetLine: true } };
    _count: { select: { comments: true } };
    comments: {
      include: {
        author: { select: { id: true; name: true; email: true } };
        mentions: { include: { person: { select: { id: true; name: true } } } };
      };
    };
  };
}>;

export type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: {
    author: { select: { id: true; name: true; email: true } };
    mentions: { include: { person: { select: { id: true; name: true } } } };
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
