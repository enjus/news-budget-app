// Shared by /me and /api/people/[id]/content so the API's capped Past list and
// the page's limit can't drift apart.

/** Past items My Assigned Stories shows before "View full history". Also the capped-mode PAST_CAP of /api/people/[id]/content. */
export const ME_PAST_LIMIT = 5
