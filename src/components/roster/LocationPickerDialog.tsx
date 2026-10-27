"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import type { Map as MapLibreMap } from "maplibre-gl"
import { toast } from "sonner"
import { mutate as mutateGlobal } from "swr"
import { LocateFixed, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { apiPath } from "@/lib/api-path"
import { displayName } from "@/lib/utils"
import { OFFICE_LOCATION, hasMoved, type LatLng } from "@/lib/roster-map"
import type { RosterProfile } from "@/types/index"

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" />,
})

interface LocationPickerDialogProps {
  personId: string
  personName: string
  isSelf: boolean
  /** The saved pin, or null when the person isn't on the map yet. */
  current: LatLng | null
  onSaved: (profile: RosterProfile) => void
  trigger: React.ReactNode
}

/** Places a roster map pin by hand: the pin stays fixed at the center and the
 *  person pans the map under it, which avoids the pan-vs-drag conflict a
 *  draggable marker has on phones. Starts at the saved pin, or at the office;
 *  Save stays disabled until the map has moved off its starting point, so an
 *  untouched default can't be saved as someone's home. */
export function LocationPickerDialog({
  personId,
  personName,
  isSelf,
  current,
  onSaved,
  trigger,
}: LocationPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const start = current ?? OFFICE_LOCATION
  const [center, setCenter] = useState<LatLng>(start)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  // Only read while the dialog is open, which is never during SSR.
  const canLocate = open && typeof navigator !== "undefined" && "geolocation" in navigator

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (val) {
      setCenter(start)
      setConfirmRemove(false)
      setLocateError(null)
    } else {
      setMap(null)
    }
  }

  function locateMe() {
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 })
      },
      (err) => {
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was blocked. Move the map by hand instead."
            : "Couldn't find your location. Move the map by hand instead."
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    )
  }

  async function send(method: "PUT" | "DELETE") {
    setSaving(true)
    try {
      const res = await fetch(apiPath(`/api/roster/${personId}/location`), {
        method,
        ...(method === "PUT"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(center),
            }
          : {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)
      toast.success(method === "PUT" ? "Map location saved" : "Removed from the map")
      onSaved(json as RosterProfile)
      mutateGlobal("/api/roster/map")
      setOpen(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const whose = isSelf ? "your" : "their"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isSelf ? "My map location" : `Map location for ${displayName(personName)}`}
          </DialogTitle>
          <DialogDescription>
            Move the map so the pin is near {whose} home. Within a few blocks is fine.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[55dvh] min-h-64 overflow-hidden rounded-md border">
          {open && (
            <MapCanvas
              className="size-full"
              center={start}
              zoom={current ? 14 : 12}
              onReady={(m) => {
                setMap(m)
                const onMove = () => {
                  const c = m.getCenter()
                  setCenter({ latitude: c.lat, longitude: c.lng })
                }
                m.on("move", onMove)
                return () => m.off("move", onMove)
              }}
            />
          )}
          {/* Fixed center pin: its tip, not its middle, marks the spot. */}
          <MapPin
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-full fill-primary text-primary-foreground drop-shadow"
            strokeWidth={1.5}
          />
        </div>

        {isSelf && canLocate && (
          <div className="space-y-1">
            <Button type="button" size="sm" variant="outline" onClick={locateMe} disabled={!map}>
              <LocateFixed className="size-4" />
              Use my location
            </Button>
            {locateError && <p className="text-xs text-muted-foreground">{locateError}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {current &&
              (confirmRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Remove from the map?</span>
                  <Button size="sm" variant="destructive" disabled={saving} onClick={() => send("DELETE")}>
                    Remove
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                  Remove from map
                </Button>
              ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !map || !hasMoved(start, center)}
              onClick={() => send("PUT")}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
