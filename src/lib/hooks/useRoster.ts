import useSWR from "swr"
import type { RosterListItem, RosterMapPin, RosterProfile, RosterStatus } from "@/types/index"

export const ROSTER_STATUS_KEY = "/api/roster/me/status"

/** The signed-in user's pending roster nudges. Pass `false` to skip the fetch
 *  (signed out, or the roster is still dark-launched). */
export function useRosterStatus(enabled = true) {
  const { data, mutate } = useSWR<RosterStatus>(enabled ? ROSTER_STATUS_KEY : null, {
    revalidateOnFocus: false,
  })
  return { status: data, mutate }
}

/** Every active person's public roster fields (GET /api/roster). Filtering is
 *  done client-side in RosterView — the whole newsroom fits in one payload. */
export function useRoster() {
  const { data, isLoading, error, mutate } = useSWR<RosterListItem[]>("/api/roster")
  return { people: data ?? [], isLoading, error, mutate }
}

/** One profile including personal contact details (GET /api/roster/[id]). */
export function useRosterProfile(id: string | null | undefined) {
  const { data, isLoading, error, mutate } = useSWR<RosterProfile>(
    id ? `/api/roster/${id}` : null
  )
  return { profile: data, isLoading, error, mutate }
}

// Stable fallback: RosterMapView pushes `pins` into the map in an effect, so a
// fresh [] per render would re-upload an empty source on every re-render.
const NO_PINS: RosterMapPin[] = []

/** Dots for /roster/map: active people with a pin (GET /api/roster/map).
 *  Pass `false` to hold off until the confidentiality reminder is
 *  acknowledged. */
export function useRosterMap(enabled = true) {
  const { data, isLoading, error, mutate } = useSWR<RosterMapPin[]>(
    enabled ? "/api/roster/map" : null
  )
  return { pins: data ?? NO_PINS, isLoading, error, mutate }
}
