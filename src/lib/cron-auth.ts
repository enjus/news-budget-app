/**
 * Whether a cron request may run: its Authorization header must be exactly
 * `Bearer <CRON_SECRET>`, and the secret itself must be configured. With
 * CRON_SECRET unset or empty the check fails closed — otherwise a header of
 * "Bearer undefined" or "Bearer " would match the interpolated template.
 * Pure (no env access) so the cases are unit-testable; the route passes
 * `process.env.CRON_SECRET` in.
 */
export function isAuthorizedCronRequest(
  authHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
