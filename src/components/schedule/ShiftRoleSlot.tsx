"use client"

// One role's assignee list for one shift day (issue #19 §6) — a list, not a
// single cell, since two people can share a role and a slot with zero people
// is the gap the view is meant to surface. The empty state renders visibly
// differently from a filled one so a gap reads as a gap, not as "not
// checked yet."

import { useState } from "react"
import { toast } from "sonner"
import { Plus, X, AlertTriangle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn, displayName } from "@/lib/utils"
import { apiPath } from "@/lib/api-path"
import type { ShiftRoleAssignment, ShiftRosterPerson } from "@/lib/hooks/useShifts"

interface ShiftRoleSlotProps {
  date: string
  shiftRole: string
  roleLabel: string
  assignments: ShiftRoleAssignment[]
  roster: ShiftRosterPerson[]
  onSaved: () => void
}

export function ShiftRoleSlot({ date, shiftRole, roleLabel, assignments, roster, onSaved }: ShiftRoleSlotProps) {
  const [open, setOpen] = useState(false)
  const [personId, setPersonId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [writeWorkingRow, setWriteWorkingRow] = useState(true)
  const [saving, setSaving] = useState(false)

  const assignedIds = new Set(assignments.map((a) => a.personId))
  const available = roster.filter((p) => !assignedIds.has(p.id))

  function reset() {
    setPersonId(null)
    setNote("")
    setWriteWorkingRow(true)
  }

  async function handleAssign() {
    if (!personId) return
    setSaving(true)
    try {
      const res = await fetch(apiPath("/api/schedule/shifts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shiftRole, personId, note: note || null, writeWorkingRow }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to assign shift")
      }
      toast.success("Assigned")
      onSaved()
      reset()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign shift")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(apiPath(`/api/schedule/shifts/${id}`), { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to remove assignment")
      }
      toast.success("Removed")
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove assignment")
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border p-2 space-y-1.5",
        assignments.length === 0 && "border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/10"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-muted-foreground">{roleLabel}</span>
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Add to ${roleLabel}`}>
              <Plus className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search roster..." />
              <CommandList>
                <CommandEmpty>No one available.</CommandEmpty>
                <CommandGroup>
                  {available.map((p) => (
                    <CommandItem key={p.id} value={displayName(p.name)} onSelect={() => setPersonId(p.id)}>
                      <span className={cn(personId === p.id && "font-semibold")}>{displayName(p.name)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            {personId && (
              <div className="border-t p-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`note-${date}-${shiftRole}`} className="text-xs">Note</Label>
                  <Input
                    id={`note-${date}-${shiftRole}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional"
                    className="text-base"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`working-${date}-${shiftRole}`}
                    checked={writeWorkingRow}
                    onCheckedChange={(checked) => setWriteWorkingRow(checked === true)}
                  />
                  <Label htmlFor={`working-${date}-${shiftRole}`} className="font-normal text-xs">
                    Also mark as working
                  </Label>
                </div>
                <Button size="sm" className="w-full" onClick={handleAssign} disabled={saving}>
                  {saving ? "Saving..." : "Assign"}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {assignments.length === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">Unfilled</p>
      ) : (
        <ul className="space-y-1">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-1 text-sm">
              <span className="flex items-center gap-1 min-w-0">
                {a.conflict && (
                  <span title={a.conflict.message}>
                    {a.conflict.severity === "warning" ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
                    ) : (
                      <Info className="size-3.5 shrink-0 text-amber-500" />
                    )}
                  </span>
                )}
                <span className="truncate">{displayName(a.name)}</span>
                {a.note && <span className="truncate text-xs text-muted-foreground">— {a.note}</span>}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${a.name}`}
                onClick={() => handleRemove(a.id)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
