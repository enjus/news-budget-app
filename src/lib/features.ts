export const VIDEOS_ENABLED = process.env.NEXT_PUBLIC_VIDEOS_ENABLED !== "false";

// Pitches (issue #24) is still being built out on feature/pitches — opt-in
// and off by default so it stays isolated from the nav until it's ready to
// ship. The API routes and /budget/pitches page still work directly by URL;
// this only hides the nav entry points.
export const PITCHES_ENABLED = process.env.NEXT_PUBLIC_PITCHES_ENABLED === "true";
