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

/**
 * Where to send the user after sign-in: the `callbackUrl` the auth middleware
 * put on /login (an app-relative path that already includes the basePath), or
 * the homepage. It comes from the query string, so anything that isn't a path
 * inside this app (another origin, "//host", "/\host", outside the basePath,
 * or /login itself) falls back to the homepage.
 */
export function signInRedirectPath(callbackUrl: string | undefined | null): string {
  const home = apiPath("/")
  if (!callbackUrl || !callbackUrl.startsWith("/")) return home
  if (callbackUrl.startsWith("//") || callbackUrl.startsWith("/\\")) return home
  if (BASE_PATH && callbackUrl !== BASE_PATH && !callbackUrl.startsWith(`${BASE_PATH}/`)) return home
  const login = apiPath("/login")
  if (callbackUrl === login || callbackUrl.startsWith(`${login}?`) || callbackUrl.startsWith(`${login}/`)) return home
  return callbackUrl
}
