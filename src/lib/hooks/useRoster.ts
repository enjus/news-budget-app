import useSWR from "swr"
import type { RosterListItem, RosterMapPin, RosterProfile } from "@/types/index"

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

/** Dots for /roster/map: active people with a pin (GET /api/roster/map).
 *  Pass `false` to hold off until the confidentiality reminder is
 *  acknowledged. */
export function useRosterMap(enabled = true) {
  const { data, isLoading, error, mutate } = useSWR<RosterMapPin[]>(
    enabled ? "/api/roster/map" : null
  )
  return { pins: data ?? [], isLoading, error, mutate }
}
