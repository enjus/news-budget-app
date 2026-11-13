export const VIDEOS_ENABLED = process.env.NEXT_PUBLIC_VIDEOS_ENABLED !== "false";

// Visual requests (issue #23, slice 1) are dark-launched: this only hides the
// "Request" form in VisualSection. The API accepts requests by direct call
// regardless. Keep it off in production until slice 3 (the /requests dashboard)
// exists, since that is the only place unplaced visuals can be seen.
export const VISUAL_REQUESTS_ENABLED = process.env.NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED === "true";
