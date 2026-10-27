import type { Prisma } from "@prisma/client"

// Prisma selects for the /api/roster routes. Explicit selects (not include)
// so the list never carries PersonPrivate and the shapes stay stable as
// Person grows. Types derived from these live in src/types/index.ts.

export const ROSTER_LIST_SELECT = {
  id: true,
  name: true,
  title: true,
  email: true,
  workPhone: true,
  isStaff: true,
  pronouns: true,
  xHandle: true,
  blueskyHandle: true,
  linkedinSlug: true,
  instagramHandle: true,
  languages: true,
} satisfies Prisma.PersonSelect

export const ROSTER_PROFILE_SELECT = {
  ...ROSTER_LIST_SELECT,
  isActive: true,
  user: { select: { id: true } },
  teamMemberships: {
    select: { role: true, team: { select: { id: true, name: true } } },
    orderBy: { team: { name: "asc" } },
  },
  private: {
    select: {
      personalPhone: true,
      personalEmail: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
      locationUpdatedAt: true,
    },
  },
} satisfies Prisma.PersonSelect

// The roster map (GET /api/roster/map): just enough to draw and label a dot.
// Never the rest of PersonPrivate — the map shouldn't double as an address export.
export const ROSTER_MAP_SELECT = {
  id: true,
  name: true,
  title: true,
  isStaff: true,
  private: { select: { latitude: true, longitude: true } },
} satisfies Prisma.PersonSelect

/** Contact fields cleared when the profile form saves an all-blank `private`
 *  but the row still holds a map pin (so the row can't simply be deleted). */
export const PRIVATE_CONTACT_FIELDS = [
  "personalPhone",
  "personalEmail",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
] as const
