"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import type { GeoJSONSource, LngLatBounds, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl"
import { ArrowLeft, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LocationPickerDialog } from "@/components/roster/LocationPickerDialog"
import { PrivateReminderDialog, hasPrivateAck, setPrivateAck } from "@/components/roster/PrivateReminderDialog"
import { RosterRow } from "@/components/roster/RosterRow"
import { StaffFilter, matchesStaffFilter, type StaffFilterValue } from "@/components/roster/StaffFilter"
import { useRosterMap, useRosterProfile } from "@/lib/hooks/useRoster"
import { CONTRIBUTOR_COLOR, OFFICE_LOCATION, STAFF_COLOR } from "@/lib/roster-map"
import { displayName } from "@/lib/utils"
import type { RosterMapPin } from "@/types/index"

const MapCanvas = dynamic(() => import("@/components/roster/MapCanvas"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" />,
})

const noopSubscribe = () => () => {}

const SOURCE_ID = "people"
const LAYER_ID = "people-dots"

function fitToPins(map: MapLibreMap, pins: RosterMapPin[], duration = 0) {
  const lngs = pins.map((p) => p.longitude)
  const lats = pins.map((p) => p.latitude)
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 48, maxZoom: 12, duration }
  )
}

function toGeoJSON(pins: RosterMapPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      properties: { id: p.id, isStaff: p.isStaff },
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
    })),
  }
}

export function RosterMapView() {
  const router = useRouter()
  const { data: session } = useSession()
  const myPersonId = session?.user?.personId

  // Pins aren't fetched until the confidentiality reminder is acknowledged
  // (once per browser session, shared with the profile reminder).
  // sessionStorage only exists in the browser: the server snapshot says "not
  // acknowledged, not hydrated" so nothing opens until the client has checked.
  const storedAck = useSyncExternalStore(noopSubscribe, hasPrivateAck, () => false)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const [confirmed, setConfirmed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const confirmedRef = useRef(false)
  const acked = storedAck || confirmed
  const reminderOpen = hydrated && !acked && !leaving

  const { pins, isLoading, error } = useRosterMap(acked)
  const { profile: myProfile, mutate: mutateMyProfile } = useRosterProfile(myPersonId)
  const myPin =
    myProfile?.private?.latitude != null && myProfile.private.longitude != null
      ? { latitude: myProfile.private.latitude, longitude: myProfile.private.longitude }
      : null

  const [filter, setFilter] = useState<StaffFilterValue>("staff")
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // The map's current view, updated when a pan/zoom settles; the table lists
  // only the filtered people whose pins fall inside it.
  const [viewBounds, setViewBounds] = useState<LngLatBounds | null>(null)
  const fittedRef = useRef(false)

  const visible = pins.filter((p) => matchesStaffFilter(p, filter))
  const selected = pins.filter((p) => selectedIds.includes(p.id) && matchesStaffFilter(p, filter))
  // Pins arrive in surname order from the API, so filtering keeps the table sorted.
  const inView = visible.filter(
    (p) => !viewBounds || viewBounds.contains([p.longitude, p.latitude])
  )

  // Push pins into the map; fit to the filtered ones the first time there are
  // any, so dots the filter hides don't widen the view.
  useEffect(() => {
    if (!map) return
    ;(map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(toGeoJSON(pins))
  }, [map, pins])

  useEffect(() => {
    if (!map || fittedRef.current) return
    const fitTo = pins.filter((p) => matchesStaffFilter(p, filter))
    if (fitTo.length > 0) {
      fittedRef.current = true
      fitToPins(map, fitTo)
    }
  }, [map, pins, filter])

  useEffect(() => {
    if (!map) return
    map.setFilter(
      LAYER_ID,
      filter === "all" ? null : ["==", ["get", "isStaff"], filter === "staff"]
    )
  }, [map, filter])

  function handleReady(m: MapLibreMap) {
    m.addSource(SOURCE_ID, { type: "geojson", data: toGeoJSON([]) })
    // Staff: filled dot with a white ring. Contributors: hollow ring. Fill as
    // well as color, so the two read apart without relying on color alone.
    m.addLayer({
      id: LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": 7,
        "circle-color": ["case", ["get", "isStaff"], STAFF_COLOR, CONTRIBUTOR_COLOR],
        "circle-opacity": ["case", ["get", "isStaff"], 1, 0],
        "circle-stroke-color": ["case", ["get", "isStaff"], "#ffffff", CONTRIBUTOR_COLOR],
        "circle-stroke-width": ["case", ["get", "isStaff"], 1.5, 2.5],
      },
    })

    const onClick = (e: MapMouseEvent) => {
      const { x, y } = e.point
      const hits = m.queryRenderedFeatures(
        [
          [x - 6, y - 6],
          [x + 6, y + 6],
        ],
        { layers: [LAYER_ID] }
      )
      setSelectedIds(Array.from(new Set(hits.map((f) => String(f.properties.id)))))
    }
    // moveend fires once per settled pan/zoom (and after resizes and fits),
    // so the table doesn't re-render on every animation frame.
    const onMoveEnd = () => setViewBounds(m.getBounds())
    const onEnter = () => (m.getCanvas().style.cursor = "pointer")
    const onLeave = () => (m.getCanvas().style.cursor = "")
    m.on("click", onClick)
    m.on("moveend", onMoveEnd)
    m.on("mouseenter", LAYER_ID, onEnter)
    m.on("mouseleave", LAYER_ID, onLeave)

    // A theme flip rebuilds the map; refit to the pins on the new one.
    fittedRef.current = false
    setViewBounds(m.getBounds())
    setMap(m)
    return () => {
      m.off("click", onClick)
      m.off("moveend", onMoveEnd)
      m.off("mouseenter", LAYER_ID, onEnter)
      m.off("mouseleave", LAYER_ID, onLeave)
      // viewBounds is left as is: a theme flip rebuilds the map, and clearing
      // it would flash the whole list until the new map reports its view.
      setMap(null)
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Roster
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Roster map</h1>
        {myPersonId && myProfile?.isActive && (
          <LocationPickerDialog
            personId={myPersonId}
            personName={myProfile.name}
            isSelf
            current={myPin}
            onSaved={(updated) => mutateMyProfile(updated, { revalidate: false })}
            trigger={
              <Button size="sm" variant="outline">
                <MapPin className="size-4" />
                {myPin ? "Edit my location" : "Add me"}
              </Button>
            }
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StaffFilter value={filter} onChange={setFilter} />

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-full border border-white"
              style={{ backgroundColor: STAFF_COLOR }}
            />
            Staff
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-full border-2"
              style={{ borderColor: CONTRIBUTOR_COLOR }}
            />
            Contributor
          </span>
        </div>
      </div>

      <div className="relative h-[50dvh] min-h-80 overflow-hidden rounded-lg border">
        {acked && (
          <MapCanvas className="size-full" center={OFFICE_LOCATION} zoom={9} onReady={handleReady} />
        )}

        {acked && !isLoading && !error && visible.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-md bg-background/90 px-3 py-2 text-sm shadow">
            {pins.length === 0
              ? "No one has added a location yet."
              : `No ${filter === "staff" ? "staff" : "contributors"} on the map yet.`}
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 top-4 mx-auto w-fit rounded-md bg-background/90 px-3 py-2 text-sm shadow">
            Couldn&apos;t load the map.
          </div>
        )}

        {selected.length > 0 && (
          <div className="absolute inset-x-2 bottom-8 max-h-[40%] overflow-y-auto rounded-md border bg-background p-3 shadow-lg sm:inset-x-auto sm:left-2 sm:w-72">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selected.length === 1 ? "1 person here" : `${selected.length} people here`}
              </span>
              <button
                onClick={() => setSelectedIds([])}
                aria-label="Close"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {selected.map((p) => (
                <li key={p.id}>
                  <Link href={`/roster/${p.id}`} className="font-medium hover:underline">
                    {displayName(p.name)}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {[p.title, p.isStaff ? "Staff" : "Contributor"].filter(Boolean).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {acked && !isLoading && !error && visible.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {inView.length === visible.length
                ? `All ${visible.length} in view`
                : `${inView.length} of ${visible.length} in view`}
            </h2>
            {map && inView.length < visible.length && (
              <button
                onClick={() => fitToPins(map, visible, 500)}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Zoom to everyone
              </button>
            )}
          </div>
          {inView.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No one in this part of the map.</p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {inView.map((p) => (
                <RosterRow key={p.id} person={p} />
              ))}
            </ul>
          )}
        </section>
      )}

      <PrivateReminderDialog
        open={reminderOpen}
        onOpenChange={(open) => {
          // Cancel/Escape without confirming: no map, back to the list.
          if (!open && !confirmedRef.current) {
            setLeaving(true)
            router.push("/roster")
          }
        }}
        onConfirm={() => {
          confirmedRef.current = true
          setPrivateAck()
          setConfirmed(true)
        }}
        confirmLabel="Show the map"
        extra="The map shows approximately where people live."
      />
    </div>
  )
}
