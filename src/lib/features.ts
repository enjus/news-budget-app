export const VIDEOS_ENABLED = process.env.NEXT_PUBLIC_VIDEOS_ENABLED !== "false";

// Roster (/roster) is dark-launched so profiles can be filled in before
// everyone sees it — the account-menu link and the cross-links from /me and
// /people/[id] are hidden while this is off, but /roster and its API routes
// work by direct URL regardless.
export const ROSTER_ENABLED = process.env.NEXT_PUBLIC_ROSTER_ENABLED === "true";
