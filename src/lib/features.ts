export const VIDEOS_ENABLED = process.env.NEXT_PUBLIC_VIDEOS_ENABLED !== "false";

// Visual requests (issue #23) are dark-launched: this hides the UI entry points
// only (the "Request a visual" button, the New Story hint, the Requests nav
// item). The API and the /requests pages work by direct URL regardless. Turn it
// on after the go-live checklist in docs/visual-requests-slice-3.md §13; it's
// baked in at build time, so flipping it needs a rebuild.
export const VISUAL_REQUESTS_ENABLED = process.env.NEXT_PUBLIC_VISUAL_REQUESTS_ENABLED === "true";
