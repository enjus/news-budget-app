export const VIDEOS_ENABLED = process.env.NEXT_PUBLIC_VIDEOS_ENABLED !== "false";

// Pitches (issue #24) is still being built out on feature/pitches — opt-in
// and off by default so it stays isolated from the nav until it's ready to
// ship. The API routes and /budget/pitches page still work directly by URL;
// this only hides the nav entry points.
export const PITCHES_ENABLED = process.env.NEXT_PUBLIC_PITCHES_ENABLED === "true";

// Staffing schedule (issue #19) is dark-launched — every /schedule/* route
// works by direct URL, but the PTO spreadsheet stays the system of record
// until this flag is flipped on. Turning it on adds Schedule to the top nav;
// that flip *is* the cutover. The sub-nav still renders on /schedule/* when
// this is off, so the routes stay navigable once you're inside them.
export const SCHEDULE_ENABLED = process.env.NEXT_PUBLIC_SCHEDULE_ENABLED === "true";
