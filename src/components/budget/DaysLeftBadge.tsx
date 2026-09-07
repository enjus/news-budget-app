/** Shared "Nd left" countdown pill. Callers do their own date math (the
 *  direction differs: counting up from a past shelvedAt vs. down to a future
 *  expiresAt) and their own null-check for "no deadline set" — this only
 *  owns the rendering, so both idioms stay in one place. A negative
 *  `daysLeft` renders as "Nd overdue" instead of collapsing into labelZero —
 *  callers that can never go negative (e.g. ShelvedView, which clamps at 0)
 *  are unaffected. */
export function DaysLeftBadge({ daysLeft, labelZero }: { daysLeft: number; labelZero: string }) {
  const urgent = daysLeft <= 14
  const text = daysLeft < 0 ? `${-daysLeft}d overdue` : daysLeft === 0 ? labelZero : `${daysLeft}d left`
  return (
    <span className={`text-xs font-medium ${urgent ? "text-destructive" : "text-muted-foreground"}`}>
      {text}
    </span>
  )
}
