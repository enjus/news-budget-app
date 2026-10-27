"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT, type LatLng } from "@/lib/roster-map"

// Served from public/ by scripts/copy-maplibre-worker.mjs — MapLibre can't find
// its worker on its own once bundled. basePath has to be added by hand here.
setWorkerUrl(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/maplibre/maplibre-gl-worker.mjs`)

/** A bare MapLibre map with OpenFreeMap tiles, light or dark to match the app
 *  theme. Callers add their own sources, layers, and handlers in `onReady`.
 *  Browser-only (WebGL, window): always load through next/dynamic with
 *  `ssr: false` — see RosterMapView and LocationPickerDialog. */
export default function MapCanvas({
  center,
  zoom,
  onReady,
  className,
}: {
  center: LatLng
  zoom: number
  /** Called once the style has loaded. Return a cleanup to run on unmount. */
  onReady: (map: MapLibreMap) => void | (() => void)
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const style = resolvedTheme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT
  const containerRef = useRef<HTMLDivElement>(null)
  // Read once at mount; later prop changes are the caller's to apply via the map.
  const initial = useRef({ center, zoom, onReady })

  // Rebuilt when the theme flips rather than setStyle(), which would drop the
  // callers' layers. Theme changes are rare enough that losing the view is fine.
  useEffect(() => {
    if (!containerRef.current) return
    const { center, zoom, onReady } = initial.current
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: [center.longitude, center.latitude],
      zoom,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), "top-right")

    let cleanup: void | (() => void)
    map.once("load", () => {
      cleanup = onReady(map)
    })
    return () => {
      cleanup?.()
      map.remove()
    }
  }, [style])

  return <div ref={containerRef} className={className} />
}
