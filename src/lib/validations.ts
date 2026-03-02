import { z } from "zod";

// ─── Enum-like string literals (validated here; stored as String in SQLite) ──

export const PersonRoleEnum = z.enum([
  "REPORTER",
  "EDITOR",
  "PHOTOGRAPHER",
  "GRAPHIC_DESIGNER",
  "PUBLICATION_DESIGNER",
  "OTHER",
]);

export const AssignmentRoleEnum = z.enum(["REPORTER", "EDITOR", "OTHER"]);

export const VisualTypeEnum = z.enum(["PHOTO", "GRAPHIC"]);

export const StoryStatusEnum = z.enum([
  "DRAFT",
  "PUBLISHED_ITERATING",
  "PUBLISHED_FINAL",
  "SHELVED",
]);

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
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens only"
    ),
  budgetLine: z.string().min(1, "Budget line is required").max(500),
  isEnterprise: z.boolean().default(false),
  status: StoryStatusEnum.default("DRAFT"),
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().default(true),
  printPubDate: z.string().datetime({ offset: true }).nullable().optional(),
  printPubDateTBD: z.boolean().default(true),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const updateStorySchema = createStorySchema.partial();

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
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens only"
    ),
  budgetLine: z.string().min(1, "Budget line is required").max(500),
  isEnterprise: z.boolean().default(false),
  status: StoryStatusEnum.default("DRAFT"),
  storyId: z.string().cuid().nullable().optional(), // null = standalone
  onlinePubDate: z.string().datetime({ offset: true }).nullable().optional(),
  onlinePubDateTBD: z.boolean().default(true),
  notes: z.string().max(5000).nullable().optional(),
  notifyTeam: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const updateVideoSchema = createVideoSchema.partial();

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
