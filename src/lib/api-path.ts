/**
 * Prepend the app's basePath to an API path for client-side fetch calls.
 *
 * Next.js automatically applies basePath to <Link> and router navigation,
 * but NOT to fetch() calls — those must be prefixed manually. This helper
 * centralizes that so the app works whether deployed at the domain root or
 * under a subpath (e.g. "/news-budget").
 *
 * Configure via NEXT_PUBLIC_BASE_PATH (must match basePath in next.config.ts).
 * Defaults to "" (root deployment) when unset.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export function apiPath(path: string): string {
  // Only prefix app-relative paths (leading slash); leave absolute URLs alone.
  if (!path.startsWith("/")) return path
  return `${BASE_PATH}${path}`
}
