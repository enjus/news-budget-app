import { differenceInDays } from "date-fns"
import { DaysLeftBadge } from "./DaysLeftBadge"

/** Same idiom as ShelvedView's DaysLeftBadge, counting down to a future
 *  expiresAt instead of up from a past shelvedAt. Renders nothing for an
 *  evergreen pitch (no expiresAt). */
export function PitchExpiryBadge({ expiresAt }: { expiresAt: string | Date | null }) {
  if (!expiresAt) return null
  const daysLeft = Math.max(0, differenceInDays(new Date(expiresAt), new Date()))
  return <DaysLeftBadge daysLeft={daysLeft} labelZero="Expires today" />
}
