# Newsroom Roster (`/roster`)

An internal staff directory: job title, work phone, pronouns, languages spoken, social accounts (X, Bluesky, LinkedIn, Instagram), and personal contact details (personal phone, personal email, home address). It sits alongside the People tab (`/people`), which is the elevated-only view of per-person assignments, and is a different surface from it.

## Access model

| Who | Can view | Can edit |
|---|---|---|
| Any signed-in user | Every active person's roster profile, **including** personal contact details | Their own profile, if their `User` is linked to a `Person` (`User.personId`) |
| ADMIN / LEADERSHIP (`hasAdminAccess`) | Same | Anyone's profile |

- **The model trusts users.** Personal contact details sit behind a "Confidential — not for public distribution" reminder (`PrivateReminderDialog`). It is shown the first time a viewer clicks "Show contact details" in a browser session and remembered in `sessionStorage`. It is a client-side courtesy, not an access gate: `GET /api/roster/[id]` returns the details to any session, and acknowledgements are not recorded. You never see the reminder for your own profile.
- **Entry point.** "Roster" in the account menu (`AccountLinks` in `TopNav.tsx`, shared by the desktop popover and the mobile menu). It is not a section in `src/lib/nav.ts`, the same treatment `/settings` gets. Your own profile is always at `/roster/me` (rendered in place, like `/me` and `/schedule/me`); `/me` and the roster's "My profile" button link there, and `/people/[id]` links across to the matching roster profile.
- **Dark launch.** All three entry points are hidden until `NEXT_PUBLIC_ROSTER_ENABLED=true` (`ROSTER_ENABLED` in `src/lib/features.ts`). `/roster` and its API work by direct URL regardless, so profiles can be filled in before launch. Flipping the flag is the launch.
- **Unlinked people.** A Person with no linked User (freelancers, staff whose account isn't linked yet) can only be edited by an admin.
- **Teams.** The profile lists the person's teams (`TeamMember`), marking team editors. Teams are admin-managed in `/admin/teams`, not part of the editable profile, and the section is omitted when someone is on no team.
- **Deactivation deletes personal details.** Marking a Person inactive (`PATCH /api/people/[id]` with `isActive: false`) deletes their `PersonPrivate` row in the same transaction, so a former employee's home address and personal phone don't linger. The "Mark inactive" buttons (`usePersonRosterActions`) ask for confirmation first. Reactivating doesn't restore anything; the details have to be re-entered. Public fields (title, pronouns, languages, socials) are kept.

## Data model

- **Public fields** are columns on `Person`: `title`, `workPhone`, `pronouns`, `xHandle`, `blueskyHandle`, `linkedinSlug`, `instagramHandle`, and `languages` (a `String[]` of codes from `ROSTER_LANGUAGES` in `src/lib/languages.ts`).
- **Personal contact details** are in `PersonPrivate`, a 1:1 table keyed by `personId` with cascade delete. **Do not move these onto `Person`.** `Person` is included in nearly every payload (story/video assignments, pickers, budget polls every 30 s), so those columns would ship home addresses to every screen. Only `/api/roster/[id]` selects `PersonPrivate`.
- **Order.** The roster list and the CSV export sort by surname, then full name (`compareBySurname()` in `src/lib/roster.ts`), sorted in JS after the query rather than by SQL `ORDER BY`. The surname is the last word of `Person.name`, so a multipart surname must be stored underscore-joined (`Ana de_la_Cruz`, `Alex Van_Der_Berg`). This is the same convention the budget cards' `surname()` and the `PersonForm` hint use; `displayName()` turns the underscores back into spaces on screen.
- **`title`** is a free-text job title ("Business Editor", "Podcast Producer", "Oregon Ducks Beat Reporter"). Neither `User.appRole` (permissions) nor `Person.defaultRole` (the assignment-picker default) can express these. The roster shows `title` and never the role. The People list and person page show it under the name. It's edited only via the roster form (self or admin), not `PersonForm`.
- **`workPhone`** is the desk/work line, shown beside the work email (`Person.email`) in the profile header. It's public, not a `PersonPrivate` field, so it gets no confidentiality reminder and survives deactivation. Unlike `email` (edited in `PersonForm`), it's edited in the roster form, self or admin.
- **Social fields** store the bare handle: no `@`, no URL. LinkedIn stores the `/in/<slug>` part. Known gap: a non-ASCII vanity slug is accepted when pasted as a profile URL (stored percent-encoded) but rejected when typed bare. Phone numbers are stored as E.164.

## Validation and normalization

- `updateRosterProfileSchema` in `src/lib/validations.ts` is deliberately **not** part of `createPersonSchema`/`updatePersonSchema`. `PATCH /api/people/[id]` accepts those from any content creator, PRODUCER included. Roster edits go only through `PATCH /api/roster/[id]`, which checks `canEditRosterProfile()`.
- The pure helpers in `src/lib/roster.ts` (covered by `roster.test.ts`) normalize pasted handles and profile URLs per platform, normalize phones with `libphonenumber-js/min` (default region US), and build the display strings and links.
- `ROSTER_LANGUAGES` is a curated list with hard-coded English labels, so server and client render the same text. Codes are validated only on write. A code removed from the list still renders via `languageLabel()`'s fallback, and the edit form drops it on the next save.

## API

| Route | Gate | Returns |
|---|---|---|
| `GET /api/roster` | session | Active people, public fields plus work email and phone (`ROSTER_LIST_SELECT`), never `PersonPrivate`. No query filters; `RosterView` filters client-side. |
| `GET /api/roster/[id]` | session | `ROSTER_PROFILE_SELECT`: public fields, work email and phone, `isActive`, and `private`. `Cache-Control: no-store`. |
| `PATCH /api/roster/[id]` | `canEditRosterProfile` | Updates the public fields; a `private` object upserts `PersonPrivate` in the same transaction. An all-blank `private` deletes the row, so a `PersonPrivate` row always has at least one value — unless the row holds a map pin, in which case only the eight contact fields are cleared (`PRIVATE_CONTACT_FIELDS`). Never touches coordinates. |
| `PUT /api/roster/[id]/location` | `canEditRosterProfile` | Body `{ latitude, longitude }` (`rosterLocationSchema`). Upserts the pin, rounded to 5 decimals, and sets `locationUpdatedAt`. 400 for an inactive person. Returns `ROSTER_PROFILE_SELECT`. |
| `DELETE /api/roster/[id]/location` | `canEditRosterProfile` | Clears the pin; deletes the `PersonPrivate` row if no contact field is left. Returns `ROSTER_PROFILE_SELECT`. |
| `GET /api/roster/map` | session | Active people with a pin: `id`, `name`, `title`, `isStaff`, `latitude`, `longitude` only (`ROSTER_MAP_SELECT`, flattened). `no-store`. |
| `GET /api/roster/export` | session | Active staff only (`ROSTER_WHERE`: `isStaff` and `isActive`, so freelancers are excluded), personal contact details included, as `newsroom-roster-YYYY-MM-DD.csv` (UTF-8 with BOM for Excel, CRLF rows, `no-store`). |

## Offline backup (CSV export)

"Download CSV" on `/roster` saves every active staff member's profile (freelancers excluded), home addresses included, so people can keep a local copy in case an outage or disaster takes the newsroom tools offline. Notes:
- **Audience:** any signed-in user, the same as the profiles. The confidentiality dialog appears on **every** download, not once per session: a file on disk outlives the session and can be forwarded. It also tells people to keep the file on a password-protected device, not to email or upload it, and to refresh it periodically.
- **Format:** built by `buildRosterCsv()` in `src/lib/roster.ts` (tested). Phones are human-formatted, languages are labels, and social accounts are full URLs. Every user-entered cell passes through `safeCsvText()` (`src/lib/csv.ts`), which prefixes `'` to anything a spreadsheet would run as a formula (`=`, `+`, `-`, `@`), except phone-number-shaped values.
- **Shared helpers:** `csvField`/`toCsvRow` live in `src/lib/csv.ts`, shared with `/api/schedule/export`.

## Roster map (`/roster/map`)

A map of where people live, placed by hand. There is **no address geocoding**: a pin is dropped and moved by a person, never derived from the home address. That removes the need for a geocode proxy and sidesteps geocoding providers' terms on storing results.

### Data
- `latitude`, `longitude` (nullable `Float`), and `locationUpdatedAt` on `PersonPrivate`. Nobody has a location by default; a Person is on the map only once someone places them. `locationUpdatedAt` is set on every save, for the planned nudges below.
- The pin is a `PersonPrivate` field because it is effectively a home address. **Do not put coordinates on `Person`**, for the same payload reason as the address.
- **Coordinates are written only by `/api/roster/[id]/location`, never by the profile form.** The form always sends a full `private` object, so if coordinates were part of it, saving a profile with no contact details would have deleted the pin. Instead, `PATCH /api/roster/[id]` treats a row holding a pin as non-empty: an all-blank `private` clears only the contact fields. Removing a pin deletes the row if nothing else is set.
- The pin and the home address are independent and can disagree after a move. Planned nudges, to update a pin and to refresh the profile periodically, will cover this. No consistency check runs between the two.

### Who can place a pin
- Same as other profile edits: the person themself or an admin (`canEditRosterProfile()`), through `PUT`/`DELETE /api/roster/[id]/location`. `rosterLocationSchema` requires both coordinates, latitude in [-90, 90] and longitude in [-180, 180].
- Active non-staff contributors (`isStaff: false`, `isActive: true`) can be mapped. They have no linked `User`, so only admins can place them. That is intended for now and could be loosened later.
- Inactive people are never mapped. Deactivation already deletes `PersonPrivate`, coordinates included, the map query filters on `isActive`, and the location route refuses inactive people.

### Placing a pin (`LocationPickerDialog`)
- Opened from "Add me" / "Edit my location" on the map page, and from "Add to map" / "Edit location" in a profile's Personal contact section (for anyone who can edit it). On a profile, an existing pin sits behind "Show contact details" like the address; with no pin there's nothing to hide, so editors see "Add to map" right away.
- The pin starts at the saved location, otherwise at The Oregonian's Portland office (`OFFICE_LOCATION` in `src/lib/roster-map.ts`). Device location is **not** the default: on a laptop it comes from Wi-Fi or IP, so anyone clicking from work would land on the office anyway, and home ISPs can be miles off.
- A separate **"Use my location"** button calls the browser Geolocation API. It needs HTTPS (or localhost), a permission prompt, and `geolocation=(self)` in the `Permissions-Policy` header (`next.config.ts`; it used to be `geolocation=()`, which blocks the API outright). On denial or error, keep the pin where it is and show a short message. Show the button only when you are editing your own location, never when an admin is placing someone else: the admin's device location would be meaningless.
- **Center-pin interaction:** the pin stays fixed at the center of the map and the person pans the map underneath it, rather than dragging a marker. This avoids the pan-vs-drag conflict on phones and works the same on desktop. The saved coordinates are the map center.
- **No saving the default:** Save stays disabled until the map has moved off its starting point (`hasMoved()`, compared at the stored 5-decimal precision), so an untouched office pin can't be mistaken for real data.
- Copy tells people precision isn't needed: *"Within a few blocks is fine."*

### The map page (`RosterMapView`)
- Data comes from `GET /api/roster/map` (`useRosterMap()`), which never returns other `PersonPrivate` fields, so the map doesn't become a bulk address export.
- The "Confidential — not for public distribution" reminder (`PrivateReminderDialog`, with an extra line about the map) shows before any pins are fetched. It shares the once-per-browser-session acknowledgement with the profile reminder; Cancel goes back to `/roster`.
- A filter switches between Staff (default), Contributors, and Everyone (`isStaff`). Staff and contributors are told apart by color **and** fill: filled dots for staff, hollow (outlined) dots for contributors (`STAFF_COLOR`/`CONTRIBUTOR_COLOR`), so the distinction doesn't rely on color alone. They're one GeoJSON `circle` layer, not image markers. Exact-coordinate overlaps are unlikely when pins are approximate, so there is no clustering.
- Clicking a dot lists who's there in a React-rendered card linking to their profile, not a MapLibre HTML popup, so user-entered names and titles never become HTML.
- Lives under the `ROSTER_ENABLED` dark launch, linked by a "Map" button on `/roster`. `/roster` belongs to no nav section, so no nav layout is needed.
- Optional later: a "who lives closest" tool working from pin coordinates.

### Platform
**MapLibre GL JS** (`maplibre-gl`, pinned exact) with **OpenFreeMap** vector tiles (`positron` light, `dark` dark): both are free, need no API key, and put no restriction on storing coordinates. Attribution is required and MapLibre's control shows it. Notes:
- `MapCanvas` is the shared wrapper. It's browser-only (WebGL, `window`), so it's always loaded with `next/dynamic` and `ssr: false`. It rebuilds the map when the app theme flips rather than calling `setStyle()`, which would drop callers' layers.
- **Worker file.** MapLibre 6 loads its tile worker from a file next to its own module, which no longer resolves once Next bundles it. `scripts/copy-maplibre-worker.mjs` (run from `postinstall`) copies `maplibre-gl-worker.mjs` into `public/maplibre/` (gitignored, and excluded from ESLint), and `MapCanvas` calls `setWorkerUrl()` with it, adding `NEXT_PUBLIC_BASE_PATH` by hand. If the map renders without tiles after a MapLibre upgrade, check that copy first.
