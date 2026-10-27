// Shared constants and pure helpers for the roster map (/roster/map) and the
// pin picker. Pins are placed by hand, never geocoded — see docs/roster.md.

export interface LatLng {
  latitude: number
  longitude: number
}

/** Where a new pin starts: The Oregonian's Portland office (1500 SW 1st Ave).
 *  Approximate is fine — it's only a starting point, and a pin can't be saved
 *  until it has been moved off it. */
export const OFFICE_LOCATION: LatLng = { latitude: 45.5137, longitude: -122.6774 }

/** OpenFreeMap vector styles: free, no API key, no limits on storing our own
 *  coordinates. Attribution is required and MapLibre shows it by default. */
export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron"
export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark"

/** Staff dots are filled, contributor dots hollow, so the two differ by more
 *  than color alone. Used by the map layer and its legend. */
export const STAFF_COLOR = "#2563eb"
export const CONTRIBUTOR_COLOR = "#ea580c"

/** Five decimals is about a meter — far finer than "within a few blocks". */
export function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

/** Whether the picker's map center has moved off where it started. Compared
 *  at the precision we store, so float jitter from MapLibre doesn't count. */
export function hasMoved(start: LatLng, center: LatLng): boolean {
  return (
    roundCoord(start.latitude) !== roundCoord(center.latitude) ||
    roundCoord(start.longitude) !== roundCoord(center.longitude)
  )
}
