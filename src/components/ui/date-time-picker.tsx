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

  // Derive local date + time parts from the ISO value
  const parsed = value ? new Date(value) : null

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

  // Sync outward whenever any part changes
  useEffect(() => {
    if (!date) {
      onChange(null)
      return
    }
    const h24 =
      ampm === "AM"
        ? parseInt(hour, 10) % 12
        : (parseInt(hour, 10) % 12) + 12
    const out = new Date(date)
    out.setHours(h24, parseInt(minute, 10), 0, 0)
    onChange(out.toISOString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, hour, minute, ampm])

  // When the external value changes (e.g. form reset), resync local state
  useEffect(() => {
    if (!value) {
      setDate(undefined)
      return
    }
    const d = new Date(value)
    setDate(d)
    setHour(String(d.getHours() % 12 || 12))
    setMinute(String(d.getMinutes()).padStart(2, "0"))
    setAmpm(d.getHours() >= 12 ? "PM" : "AM")
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
