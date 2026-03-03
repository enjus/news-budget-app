import { z } from "zod";

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

export const VisualTypeEnum = z.enum(["PHOTO", "GRAPHIC", "MAP"]);

export const StoryStatusEnum = z.enum([
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
]);

// Empty string → null before URL validation so blank inputs don't error
const optionalUrl = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().url("Must be a valid URL").nullable().optional()
);

// ─── Person ───────────────────────────────────────────────────────────────────

export const createPersonSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  defaultRole: PersonRoleEnum.default("OTHER"),
});

export const updatePersonSchema = createPersonSchema.partial();

// ─── Story ────────────────────────────────────────────────────────────────────

export const createStorySchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(
      /^[A-Z0-9 ]+$/,
      "Slug must be uppercase letters, numbers, and spaces only"
    ),
  budgetLine: z.string().min(1, "Budget line is required").max(500),
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
});

export const updateStorySchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[A-Z0-9 ]+$/, "Slug must be uppercase letters, numbers, and spaces only")
    .optional(),
  budgetLine: z.string().min(1, "Budget line is required").max(500).optional(),
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
});

// ─── Assignment ───────────────────────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  personId: z.string().cuid(),
  role: AssignmentRoleEnum,
});

// ─── Visual ───────────────────────────────────────────────────────────────────

export const createVisualSchema = z.object({
  type: VisualTypeEnum,
  description: z.string().max(500).nullable().optional(),
  personId: z.string().cuid().nullable().optional(),
});

export const updateVisualSchema = createVisualSchema.partial();

// ─── Video ────────────────────────────────────────────────────────────────────

export const createVideoSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(
      /^[A-Z0-9 ]+$/,
      "Slug must be uppercase letters, numbers, and spaces only"
    ),
  budgetLine: z.string().min(1, "Budget line is required").max(500),
  isEnterprise: z.boolean().default(false),
  status: StoryStatusEnum.default("DRAFT"),
  storyId: z.string().cuid().nullable().optional(), // null = standalone
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().default(true),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().default(false),
  aiContributed: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  youtubeUrl: optionalUrl,
  reelsUrl: optionalUrl,
  tiktokUrl: optionalUrl,
  otherUrl: optionalUrl,
});

export const updateVideoSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[A-Z0-9 ]+$/, "Slug must be uppercase letters, numbers, and spaces only")
    .optional(),
  budgetLine: z.string().min(1, "Budget line is required").max(500).optional(),
  isEnterprise: z.boolean().optional(),
  status: StoryStatusEnum.optional(),
  storyId: z.string().cuid().nullable().optional(),
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().optional(),
  aiContributed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  youtubeUrl: optionalUrl,
  reelsUrl: optionalUrl,
  tiktokUrl: optionalUrl,
  otherUrl: optionalUrl,
});

export const createVideoAssignmentSchema = z.object({
  personId: z.string().cuid(),
  role: AssignmentRoleEnum,
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateVisualInput = z.infer<typeof createVisualSchema>;
export type UpdateVisualInput = z.infer<typeof updateVisualSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type CreateVideoAssignmentInput = z.infer<typeof createVideoAssignmentSchema>;
