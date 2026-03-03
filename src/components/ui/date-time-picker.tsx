"use client"

import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  /** ISO string or null */
  value: string | null | undefined
  onChange: (iso: string | null) => void
  className?: string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1–12
const MINUTES = ["00", "15", "30", "45"]

export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)

  // Pub times are stored as newsroom-time-as-UTC. Convert UTC fields into a
  // synthetic local Date so the Calendar and selects show the right values.
  function toFakeLocal(iso: string): Date {
    const d = new Date(iso)
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
  }

  const parsed = value ? toFakeLocal(value) : null

  const [date, setDate] = useState<Date | undefined>(parsed ?? undefined)
  const [hour, setHour] = useState<string>(
    parsed ? String(parsed.getHours() % 12 || 12) : "9"
  )
  const [minute, setMinute] = useState<string>(
    parsed ? String(parsed.getMinutes()).padStart(2, "0") : "00"
  )
  const [ampm, setAmpm] = useState<"AM" | "PM">(
    parsed ? (parsed.getHours() >= 12 ? "PM" : "AM") : "AM"
  )

  // Sync outward whenever any part changes.
  // Emit as newsroom-time-as-UTC: "9:00 AM" on Mar 3 → "2026-03-03T09:00:00.000Z"
  useEffect(() => {
    if (!date) {
      onChange(null)
      return
    }
    const h24 =
      ampm === "AM"
        ? parseInt(hour, 10) % 12
        : (parseInt(hour, 10) % 12) + 12
    const y = String(date.getFullYear())
    const mo = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    const h = String(h24).padStart(2, "0")
    const m = minute.padStart(2, "0")
    onChange(`${y}-${mo}-${d}T${h}:${m}:00.000Z`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, hour, minute, ampm])

  // When the external value changes (e.g. form reset), resync local state
  useEffect(() => {
    if (!value) {
      setDate(undefined)
      return
    }
    const fake = toFakeLocal(value)
    setDate(fake)
    setHour(String(fake.getHours() % 12 || 12))
    setMinute(String(fake.getMinutes()).padStart(2, "0"))
    setAmpm(fake.getHours() >= 12 ? "PM" : "AM")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const displayLabel = date
    ? `${format(date, "MMM d, yyyy")} ${hour}:${minute} ${ampm}`
    : "Pick a date & time"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
        />
        {/* Time row */}
        <div className="flex items-center gap-2 border-t px-3 py-3">
          <span className="text-sm text-muted-foreground mr-1">Time</span>

          {/* Hour */}
          <Select value={hour} onValueChange={setHour}>
            <SelectTrigger className="h-8 w-[64px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm font-medium">:</span>

          {/* Minute */}
          <Select value={minute} onValueChange={setMinute}>
            <SelectTrigger className="h-8 w-[64px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* AM/PM */}
          <Select value={ampm} onValueChange={(v) => setAmpm(v as "AM" | "PM")}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM">AM</SelectItem>
              <SelectItem value="PM">PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
