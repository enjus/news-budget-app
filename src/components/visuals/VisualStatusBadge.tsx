import { Badge } from "@/components/ui/badge"
import { VISUAL_STATUS_LABELS, isVisualStatus } from "@/lib/visual-statuses"

type StatusVariant = "default" | "secondary" | "destructive" | "outline"

// PLANNED has no entry: a credit shows no status badge (it looks as it always did).
const STATUS_BADGE_VARIANT: Record<string, StatusVariant> = {
  REQUESTED: "outline",
  ASSIGNED: "secondary",
  IN_PROGRESS: "secondary",
  DELIVERED: "default",
  DECLINED: "destructive",
  CANCELED: "outline",
}

/** A request's status, styled the same on the story page, the request page and the dashboard. */
export function VisualStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status] ?? "outline"} className={className}>
      {isVisualStatus(status) ? VISUAL_STATUS_LABELS[status] : status}
    </Badge>
  )
}

/** The cosmetic URGENT marker. */
export function UrgentBadge({ className }: { className?: string }) {
  return <Badge variant="destructive" className={className}>Urgent</Badge>
}
