# Newsroom Roster (`/roster`)

An internal staff directory: pronouns, languages spoken, social accounts (X, Bluesky, LinkedIn, Instagram), and personal contact details (personal phone, personal email, home address). It sits alongside the People tab (`/people`), which is the elevated-only view of per-person assignments, and is a different surface from it.

## Access model

| Who | Can view | Can edit |
|---|---|---|
| Any signed-in user | Every active person's roster profile, **including** personal contact details | Their own profile, if their `User` is linked to a `Person` (`User.personId`) |
| ADMIN / LEADERSHIP (`hasAdminAccess`) | Same | Anyone's profile |

- **The model trusts users.** Personal contact details sit behind a "Confidential — not for public distribution" reminder (`PrivateReminderDialog`). It is shown the first time a viewer clicks "Show contact details" in a browser session and remembered in `sessionStorage`. It is a client-side courtesy, not an access gate: `GET /api/roster/[id]` returns the details to any session, and acknowledgements are not recorded. You never see the reminder for your own profile.
- **Entry point.** "Roster" in the account menu (`AccountLinks` in `TopNav.tsx`, shared by the desktop popover and the mobile menu). It is not a section in `src/lib/nav.ts`, the same treatment `/settings` gets. `/me` links to your own profile, and `/people/[id]` links across to the matching roster profile.
- **Dark launch.** All three entry points are hidden until `NEXT_PUBLIC_ROSTER_ENABLED=true` (`ROSTER_ENABLED` in `src/lib/features.ts`). `/roster` and its API work by direct URL regardless, so profiles can be filled in before launch. Flipping the flag is the launch.
- **Unlinked people.** A Person with no linked User (freelancers, staff whose account isn't linked yet) can only be edited by an admin.
- **Teams.** The profile lists the person's teams (`TeamMember`), marking team editors. Teams are admin-managed in `/admin/teams`, not part of the editable profile, and the section is omitted when someone is on no team.
- **Deactivation deletes personal details.** Marking a Person inactive (`PATCH /api/people/[id]` with `isActive: false`) deletes their `PersonPrivate` row in the same transaction, so a former employee's home address and personal phone don't linger. The "Mark inactive" buttons (`usePersonRosterActions`) ask for confirmation first. Reactivating doesn't restore anything; the details have to be re-entered. Public fields (title, pronouns, languages, socials) are kept.

## Data model

- **Public fields** are columns on `Person`: `title`, `pronouns`, `xHandle`, `blueskyHandle`, `linkedinSlug`, `instagramHandle`, and `languages` (a `String[]` of codes from `ROSTER_LANGUAGES` in `src/lib/languages.ts`).
- **Personal contact details** are in `PersonPrivate`, a 1:1 table keyed by `personId` with cascade delete. **Do not move these onto `Person`.** `Person` is included in nearly every payload (story/video assignments, pickers, budget polls every 30 s), so those columns would ship home addresses to every screen. Only `/api/roster/[id]` selects `PersonPrivate`.
- **`title`** is a free-text job title ("Business Editor", "Podcast Producer", "Oregon Ducks Beat Reporter"). Neither `User.appRole` (permissions) nor `Person.defaultRole` (the assignment-picker default) can express these. The roster shows `title` and never the role. The People list and person page show it under the name. It's edited only via the roster form (self or admin), not `PersonForm`.
- **Social fields** store the bare handle: no `@`, no URL. LinkedIn stores the `/in/<slug>` part. Known gap: a non-ASCII vanity slug is accepted when pasted as a profile URL (stored percent-encoded) but rejected when typed bare. Phone numbers are stored as E.164.

## Validation and normalization

- `updateRosterProfileSchema` in `src/lib/validations.ts` is deliberately **not** part of `createPersonSchema`/`updatePersonSchema`. `PATCH /api/people/[id]` accepts those from any content creator, PRODUCER included. Roster edits go only through `PATCH /api/roster/[id]`, which checks `canEditRosterProfile()`.
- The pure helpers in `src/lib/roster.ts` (covered by `roster.test.ts`) normalize pasted handles and profile URLs per platform, normalize phones with `libphonenumber-js/min` (default region US), and build the display strings and links.
- `ROSTER_LANGUAGES` is a curated list with hard-coded English labels, so server and client render the same text. Codes are validated only on write. A code removed from the list still renders via `languageLabel()`'s fallback, and the edit form drops it on the next save.

## API

| Route | Gate | Returns |
|---|---|---|
| `GET /api/roster` | session | Active people, public fields only (`ROSTER_LIST_SELECT`). No query filters; `RosterView` filters client-side. |
| `GET /api/roster/[id]` | session | `ROSTER_PROFILE_SELECT`: public fields, work email, `isActive`, and `private`. `Cache-Control: no-store`. |
| `PATCH /api/roster/[id]` | `canEditRosterProfile` | Updates the public fields; a `private` object upserts `PersonPrivate` in the same transaction. An all-blank `private` deletes the row, so a `PersonPrivate` row always has at least one value. |
| `GET /api/roster/export` | session | Active staff only (`ROSTER_WHERE`: `isStaff` and `isActive`, so freelancers are excluded), personal contact details included, as `newsroom-roster-YYYY-MM-DD.csv` (UTF-8 with BOM for Excel, CRLF rows, `no-store`). |

## Offline backup (CSV export)

"Download CSV" on `/roster` saves every active staff member's profile (freelancers excluded), home addresses included, so people can keep a local copy in case an outage or disaster takes the newsroom tools offline. Notes:
- **Audience:** any signed-in user, the same as the profiles. The confidentiality dialog appears on **every** download, not once per session: a file on disk outlives the session and can be forwarded. It also tells people to keep the file on a password-protected device, not to email or upload it, and to refresh it periodically.
- **Format:** built by `buildRosterCsv()` in `src/lib/roster.ts` (tested). Phones are human-formatted, languages are labels, and social accounts are full URLs. Every user-entered cell passes through `safeCsvText()` (`src/lib/csv.ts`), which prefixes `'` to anything a spreadsheet would run as a formula (`=`, `+`, `-`, `@`), except phone-number-shaped values.
- **Shared helpers:** `csvField`/`toCsvRow` live in `src/lib/csv.ts`, shared with `/api/schedule/export`.

## Deferred: mapping

Geocoded address search and a manually correctable map pin are planned once a mapping platform is chosen. Expected additions:
- `latitude`, `longitude`, and `locationSource` (`GEOCODED | MANUAL`) on `PersonPrivate`, as an additive `db push`
- a server-side geocode proxy
- an `AddressPicker` flow: search, then a draggable pin
- optionally, a roster map with a "who lives closest" tool

When choosing a platform, check its terms on storing geocoded coordinates. Mapbox allows it only with `permanent=true` geocoding (billed per request) and requires results to be shown on a Mapbox map.
