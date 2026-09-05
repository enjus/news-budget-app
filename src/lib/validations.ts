import { z } from "zod";

// ─── Slug ──────────────────────────────────────────────────────────────────────
// Uppercase letters, numbers, spaces, and a fixed punctuation allowlist.
// No slash — slug values are never used as URL path segments (routing uses id),
// but keeping it out avoids confusion with path-like strings.
const SLUG_PATTERN = /^[A-Z0-9 '".,:&?!()$%-]+$/;
const SLUG_MESSAGE =
  "Slug must be uppercase letters, numbers, spaces, and punctuation (- ' \" . , : & ? ! ( ) $ %) only";

// ─── Enum-like string literals (validated here; stored as String in SQLite) ──

export const PersonRoleEnum = z.enum([
  "REPORTER",
  "EDITOR",
  "PHOTOGRAPHER",
  "VIDEOGRAPHER",
  "GRAPHIC_DESIGNER",
  "PUBLICATION_DESIGNER",
  "OTHER",
]);

export const AssignmentRoleEnum = z.enum(["REPORTER", "EDITOR", "VIDEOGRAPHER", "OTHER"]);

export const VisualTypeEnum = z.enum(["PHOTO", "GRAPHIC", "MAP", "VIDEO"]);

export const StoryStatusEnum = z.enum([
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
]);

// Editorial campaign tags — see StoryTag model comment in prisma/schema.prisma.
// Labels/colors for these live in STORY_TAG_LABELS etc. in src/lib/utils.ts.
export const StoryTagEnum = z.enum([
  "HERE_IS_OREGON",
  "CONTENT_REMIX",
  "SUMMER_FOCUS",
  "OREGON_INSIGHT",
  "VIDEO_POTENTIAL",
  "PUSHED",
]);

// Empty string → null before URL validation so blank inputs don't error
const optionalUrl = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().url("Must be a valid URL").nullable().optional()
);

// ─── Person ───────────────────────────────────────────────────────────────────

export const createPersonSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  // Optional — freelancers and other no-login contributors may not have one.
  // Blank string (from the form) becomes null, not undefined, so clearing an
  // existing email on PATCH actually clears it instead of being dropped as
  // "field not present" by JSON.stringify.
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().email("Invalid email address").nullable().optional()
  ),
  defaultRole: PersonRoleEnum.default("OTHER"),
});

export const updatePersonSchema = createPersonSchema.partial().extend({
  // Not settable at creation — people start active. Gated to admins at the API layer.
  isActive: z.boolean().optional(),
  // Not settable at creation — starts false, no backfill. Gated to canManageRoster at the API layer.
  isStaff: z.boolean().optional(),
});

// ─── Staffing schedule (Phase 1) ───────────────────────────────────────────
export const WorkScheduleSegmentEnum = z.enum(["FULL_DAY", "OFF"]);
export const CalendarMarkerKindEnum = z.enum(["HOLIDAY", "BLACKOUT", "NOTE"]);

export const workScheduleDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  segment: WorkScheduleSegmentEnum,
});

// Body for the work-schedule PATCH — only rows differing from the Mon–Fri
// default are sent; the route replaces the person's whole WorkSchedule set
// with exactly what's sent, so "no rows" means "back to Mon–Fri default."
export const replaceWorkScheduleSchema = z.object({
  days: z.array(workScheduleDaySchema).max(7),
}).refine(
  (data) => new Set(data.days.map((d) => d.weekday)).size === data.days.length,
  { message: "Duplicate weekday in days", path: ["days"] }
);

// ─── Staffing schedule (Phase 2) ────────────────────────────────────────────
// Every schedule API takes and returns "YYYY-MM-DD" strings — Date objects
// never cross the wire (src/lib/schedule.ts, dateOnly()/toDateString()).
const dateOnlyString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const AvailabilitySegmentEnum = z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]);
export const AvailabilityStatusEnum = z.enum(["OUT", "WORKING", "UNAVAILABLE"]);

// POST /api/schedule/availability — one call expands to a date range (cap:
// 180 days, enforced in the route since it depends on holiday/pattern lookups).
// `rows` (not a single segment/status) so a half-day preset that writes both
// MORNING and AFTERNOON in one shot arrives as one atomic write — the route
// clears every segment NOT present in `rows` for each date, so a stale
// opposite-half row from an earlier preset can't survive a switch. A
// single-row half-day write (e.g. "here in the morning") still correctly
// clears the other half, since that segment is simply absent from `rows`.
const availabilityRowSchema = z.object({
  segment: AvailabilitySegmentEnum,
  status: AvailabilityStatusEnum,
});

export const createAvailabilitySchema = z.object({
  personId: z.string().cuid(),
  startDate: dateOnlyString,
  endDate: dateOnlyString,
  rows: z.array(availabilityRowSchema).min(1).max(2),
  note: z.string().max(500).nullable().optional(),
  // Resolves against the person's WorkSchedule pattern AND observed holidays —
  // so a range doesn't burn a day on a standing day off or a holiday.
  skipNonWorkingDays: z.boolean().default(false),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
}).refine((data) => new Set(data.rows.map((r) => r.segment)).size === data.rows.length, {
  message: "Duplicate segment in rows",
  path: ["rows"],
}).refine((data) => data.rows.length === 1 || !data.rows.some((r) => r.segment === "FULL_DAY"), {
  message: "FULL_DAY cannot be combined with another segment",
  path: ["rows"],
});

// PATCH /api/schedule/availability/[id] — personId/date/segment are the row's
// identity and aren't editable here; only status/note can change in place.
export const updateAvailabilitySchema = z.object({
  status: AvailabilityStatusEnum.optional(),
  note: z.string().max(500).nullable().optional(),
});

// One day's desired resolved value, for the one-off week editor's diff. A
// `revert` row means "delete whatever override exists for this date and let
// it fall back to the standing pattern/holiday baseline" — used instead of
// guessing a FULL_DAY status client-side, which can't correctly express
// reverting a split (AM/PM) day back to its true baseline.
export const weekAvailabilityDaySchema = z.union([
  z.object({ date: dateOnlyString, revert: z.literal(true) }),
  z.object({
    date: dateOnlyString,
    segment: AvailabilitySegmentEnum,
    status: AvailabilityStatusEnum,
    note: z.string().max(500).nullable().optional(),
  }),
]);

// PUT /api/schedule/availability/week — up to 14 rows to allow independent
// AM/PM entries across a 7-day week.
export const putWeekAvailabilitySchema = z.object({
  personId: z.string().cuid(),
  days: z.array(weekAvailabilityDaySchema).max(14),
});

// POST/PATCH /api/schedule/markers — reuses CalendarMarkerKindEnum from
// Phase 1 above; there is no separate MarkerKindEnum. The base object is
// split out from createMarkerSchema's refinement so updateMarkerSchema can
// call .partial() — Zod doesn't allow .partial() on a schema that already
// carries a .refine().
const markerFieldsSchema = z.object({
  kind: CalendarMarkerKindEnum,
  label: z.string().min(1, "Label is required").max(100),
  startDate: dateOnlyString,
  endDate: dateOnlyString,
  note: z.string().max(500).nullable().optional(),
  observed: z.boolean().default(true), // HOLIDAY only
});

export const createMarkerSchema = markerFieldsSchema.refine((data) => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

// This refine only catches an out-of-order pair when BOTH dates are sent in
// the same PATCH — it can't see the row's stored other date, so a
// single-field PATCH (e.g. only startDate) that would put the range out of
// order against the *stored* endDate is validated in the route instead,
// after loading the current row.
export const updateMarkerSchema = markerFieldsSchema.partial().refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: "End date must be on or after start date", path: ["endDate"] }
);

// POST /api/schedule/markers/seed-holidays — seeds the standard US federal
// holiday set for a year as editable/deletable CalendarMarker rows.
export const seedHolidaysSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

// ─── Pub date / TBD cross-field validation ────────────────────────────────────
// Shared by create/update Story and Video schemas: if a *PubDateTBD flag is
// explicitly false, the matching *PubDate must be present. Without this, the
// date-time picker UI lets a user uncheck TBD, never pick a date, and have the
// story/video silently revert to TBD on save with no feedback.
// On update schemas, both fields are independently optional (partial PATCH) —
// this only fires when TBD is explicitly sent as false in the same payload; a
// PATCH that omits the TBD field entirely is untouched. No route in this repo
// currently sends TBD:false without also sending the date, so this is safe today,
// but keep that pairing intact if a future partial-PATCH path is added.
function requirePubDateField(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
  tbdField: string,
  dateField: string
) {
  if (data[tbdField] === false && !data[dateField]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [dateField],
      message: "Please choose time and date",
    });
  }
}

function requirePubDatesWhenNotTBD(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx
) {
  requirePubDateField(data, ctx, "onlinePubDateTBD", "onlinePubDate");
  requirePubDateField(data, ctx, "printPubDateTBD", "printPubDate");
}

function requireOnlinePubDateWhenNotTBD(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx
) {
  requirePubDateField(data, ctx, "onlinePubDateTBD", "onlinePubDate");
}

// ─── Story ────────────────────────────────────────────────────────────────────

export const createStorySchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(SLUG_PATTERN, SLUG_MESSAGE),
  budgetLine: z.string().min(1, "Budget line is required"),
  isEnterprise: z.boolean().default(false),
  status: StoryStatusEnum.default("DRAFT"),
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().default(true),
  printPubDate: z.string().datetime({ offset: true }).nullable().optional(),
  printPubDateTBD: z.boolean().default(true),
  notes: z.string().max(5000).nullable().optional(),
  wordCount: z.number().int().min(0).nullable().optional(),
  notifyTeam: z.boolean().default(false),
  aiContributed: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  postUrl: optionalUrl,
  workingDraftUrl: optionalUrl,
  onBudget: z.boolean().default(true),
}).superRefine(requirePubDatesWhenNotTBD);

const updateStorySchemaBase = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(SLUG_PATTERN, SLUG_MESSAGE)
    .optional(),
  budgetLine: z.string().min(1, "Budget line is required").optional(),
  isEnterprise: z.boolean().optional(),
  status: StoryStatusEnum.optional(),
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().optional(),
  printPubDate: z.string().datetime({ offset: true }).nullable().optional(),
  printPubDateTBD: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  wordCount: z.number().int().min(0).nullable().optional(),
  notifyTeam: z.boolean().optional(),
  aiContributed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  postUrl: optionalUrl,
  workingDraftUrl: optionalUrl,
  onBudget: z.boolean().optional(),
  version: z.number().int().optional(), // optimistic locking
});

export const updateStorySchema = updateStorySchemaBase.superRefine(requirePubDatesWhenNotTBD);

// ─── Assignment ───────────────────────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  personId: z.string().cuid(),
  role: AssignmentRoleEnum,
});

// ─── Story Tag ────────────────────────────────────────────────────────────────

export const createStoryTagSchema = z.object({
  tag: StoryTagEnum,
});

// ─── Visual ───────────────────────────────────────────────────────────────────

export const createVisualSchema = z.object({
  type: VisualTypeEnum,
  description: z.string().max(500).nullable().optional(),
  personId: z.string().cuid().nullable().optional(),
});

export const updateVisualSchema = createVisualSchema.partial();

// ─── Comment ──────────────────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
  // Person ids @-mentioned in the body. The body keeps the literal "@Name" text;
  // these are the authoritative records used for notifications and highlighting.
  mentionIds: z.array(z.string().cuid()).max(20).optional(),
  // true = "Post and Notify All" (email everyone assigned to the story/video)
  notifyAll: z.boolean().optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
  mentionIds: z.array(z.string().cuid()).max(20).optional(),
});

// ─── Video ────────────────────────────────────────────────────────────────────

export const createVideoSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(SLUG_PATTERN, SLUG_MESSAGE),
  budgetLine: z.string().min(1, "Budget line is required"),
  isEnterprise: z.boolean().default(false),
  status: StoryStatusEnum.default("DRAFT"),
  storyId: z.string().cuid().nullable().optional(), // null = standalone
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().default(true),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  youtubeUrl: optionalUrl,
  reelsUrl: optionalUrl,
  tiktokUrl: optionalUrl,
  otherUrl: optionalUrl,
  onBudget: z.boolean().default(true),
}).superRefine(requireOnlinePubDateWhenNotTBD);

const updateVideoSchemaBase = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(SLUG_PATTERN, SLUG_MESSAGE)
    .optional(),
  budgetLine: z.string().min(1, "Budget line is required").optional(),
  isEnterprise: z.boolean().optional(),
  status: StoryStatusEnum.optional(),
  storyId: z.string().cuid().nullable().optional(),
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  youtubeUrl: optionalUrl,
  reelsUrl: optionalUrl,
  tiktokUrl: optionalUrl,
  otherUrl: optionalUrl,
  onBudget: z.boolean().optional(),
  version: z.number().int().optional(), // optimistic locking
});

export const updateVideoSchema = updateVideoSchemaBase.superRefine(requireOnlinePubDateWhenNotTBD);

export const createVideoAssignmentSchema = z.object({
  personId: z.string().cuid(),
  role: AssignmentRoleEnum,
});

// ─── Team ─────────────────────────────────────────────────────────────────────

export const TeamMemberRoleEnum = z.enum(["EDITOR", "MEMBER"]);

export const createTeamSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).nullable().optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const addTeamMemberSchema = z.object({
  personId: z.string().cuid(),
  role: TeamMemberRoleEnum.default("MEMBER"),
});

// ─── User (admin) ────────────────────────────────────────────────────────────

export const AppRoleEnum = z.enum(["ADMIN", "LEADERSHIP", "MANAGING_PRODUCER", "SUPERVISOR", "PRODUCER", "VIEWER"])

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  appRole: AppRoleEnum.default("PRODUCER"),
  personId: z.string().cuid().nullable().optional(),
})

export const updateUserSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  appRole: AppRoleEnum.optional(),
  personId: z.string().cuid().nullable().optional(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type ReplaceWorkScheduleInput = z.infer<typeof replaceWorkScheduleSchema>;
export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type PutWeekAvailabilityInput = z.infer<typeof putWeekAvailabilitySchema>;
export type CreateMarkerInput = z.infer<typeof createMarkerSchema>;
export type UpdateMarkerInput = z.infer<typeof updateMarkerSchema>;
export type SeedHolidaysInput = z.infer<typeof seedHolidaysSchema>;
export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateStoryTagInput = z.infer<typeof createStoryTagSchema>;
export type CreateVisualInput = z.infer<typeof createVisualSchema>;
export type UpdateVisualInput = z.infer<typeof updateVisualSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type CreateVideoAssignmentInput = z.infer<typeof createVideoAssignmentSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
