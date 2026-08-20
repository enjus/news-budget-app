// Shared size tokens for StoryCard/VideoCard's "default" | "lg" scale.
// "lg" bumps type/icon/spacing for meeting-room readability (Daily Agenda, Enterprise).
// Add a new token here when a new className needs a size split — don't hand-write
// an isLg ternary in the card files, or StoryCard/VideoCard will drift out of sync.
export type CardSize = "default" | "lg"

export const CARD_SIZE: Record<CardSize, {
  padding: string      // outer card padding
  outerGap: string      // flex row gap (select-checkbox column ↔ content column)
  stackGap: string        // vertical gap between content rows
  chipRowGap: string       // bottom row (assignment/tag/word-count chips) gap
  titleIcon: string         // slug-row leading icon (FileText/VideoIcon)
  title: string               // slug text
  badge: string                 // Enterprise badge padding/text
  actionIcon: string             // copy/check icon (StoryCard only)
  body: string                     // budget line text
  metaRow: string                    // visuals/comment indicator row text
  metaIcon: string                     // camera/graphic/map/video/comment icons
  pubRow: string                         // "Online: …" row text
  pubLabel: string                         // "Online:" label color
  pubValue: string                           // date value color
  caption: string                              // secondary one-line caption (e.g. "Story: …" parent link)
  chip: string                                 // assignment/AI/tag/word-count/link chip
  chipIcon: string                               // icon inside a chip
  statusText: string                               // StatusTimeChip / VideoStatusChip text size
  statusMuted: string                                // muted-time color inside status chip
}> = {
  default: {
    padding: "p-3",
    outerGap: "gap-2.5",
    stackGap: "gap-1.5",
    chipRowGap: "gap-1",
    titleIcon: "size-3",
    title: "",
    badge: "text-[10px] px-1.5 py-0",
    actionIcon: "size-3",
    body: "text-xs text-muted-foreground",
    metaRow: "text-xs text-muted-foreground",
    metaIcon: "size-3.5",
    pubRow: "text-[10px] text-muted-foreground",
    pubLabel: "text-foreground/60",
    pubValue: "",
    caption: "text-[10px] text-muted-foreground",
    chip: "px-1.5 py-0.5 text-[10px]",
    chipIcon: "size-2.5",
    statusText: "text-[10px]",
    statusMuted: "text-muted-foreground",
  },
  lg: {
    padding: "p-4",
    outerGap: "gap-3",
    stackGap: "gap-2",
    chipRowGap: "gap-1.5",
    titleIcon: "size-4",
    title: "text-base",
    badge: "text-xs px-2 py-0.5",
    actionIcon: "size-4",
    body: "text-base text-foreground/70",
    metaRow: "text-sm text-foreground/70",
    metaIcon: "size-5",
    pubRow: "text-sm",
    pubLabel: "text-foreground/80",
    pubValue: "text-foreground/70",
    caption: "text-sm text-foreground/70",
    chip: "px-2 py-1 text-sm",
    chipIcon: "size-3.5",
    statusText: "text-sm",
    statusMuted: "text-foreground/70",
  },
}
