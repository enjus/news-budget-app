import { differenceInDays } from "date-fns"
import { DaysLeftBadge } from "./DaysLeftBadge"

/** Same idiom as ShelvedView's DaysLeftBadge, counting down to a future
 *  expiresAt instead of up from a past shelvedAt. Renders nothing for an
 *  evergreen pitch (no expiresAt). Deliberately doesn't clamp at 0 — a
 *  claimed pitch is exempt from the purge-shelved cron indefinitely, so it
 *  can sit well past its expiresAt and should show as overdue rather than
 *  "Expires today" forever. */
export function PitchExpiryBadge({ expiresAt }: { expiresAt: string | Date | null }) {
  if (!expiresAt) return null
  const daysLeft = differenceInDays(new Date(expiresAt), new Date())
  return <DaysLeftBadge daysLeft={daysLeft} labelZero="Expires today" />
}
