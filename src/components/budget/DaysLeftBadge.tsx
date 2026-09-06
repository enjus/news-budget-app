/** Shared "Nd left" countdown pill. Callers do their own date math (the
 *  direction differs: counting up from a past shelvedAt vs. down to a future
 *  expiresAt) and their own null-check for "no deadline set" — this only
 *  owns the rendering, so both idioms stay in one place. */
export function DaysLeftBadge({ daysLeft, labelZero }: { daysLeft: number; labelZero: string }) {
  const urgent = daysLeft <= 14
  return (
    <span className={`text-xs font-medium ${urgent ? "text-destructive" : "text-muted-foreground"}`}>
      {daysLeft === 0 ? labelZero : `${daysLeft}d left`}
    </span>
  )
}
