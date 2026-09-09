"use client"

// One role's assignee list for one shift day (issue #19 §6) — a list, not a
// single cell, since two people can share a role and a slot with zero people
// is the gap the view is meant to surface. The empty state renders visibly
// differently from a filled one so a gap reads as a gap, not as "not
// checked yet."

import { useState } from "react"
import { toast } from "sonner"
import { Plus, X, AlertTriangle, Info, Pencil, Check } from "lucide-react"
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

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteValue, setEditingNoteValue] = useState("")
  const [savingNote, setSavingNote] = useState(false)

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
      const created = await res.json()
      if (writeWorkingRow && created.workingRowSkipped) {
        toast.warning("Assigned — left their existing availability entry for that day unchanged (it wasn't a plain working day).")
      } else {
        toast.success("Assigned")
      }
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
      const result = await res.json()
      // TODO: once schedule views support deep-linking to a specific
      // person/date, link the warning toast straight there instead of
      // just naming "check accuracy".
      if (result.availabilityReverted) {
        toast.success("Removed from shift. Schedule reverted to default.")
      } else {
        toast.warning("Removed from shift. Schedule unchanged — check accuracy.")
      }
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove assignment")
    }
  }

  function startEditNote(a: ShiftRoleAssignment) {
    setEditingNoteId(a.id)
    setEditingNoteValue(a.note ?? "")
  }

  function cancelEditNote() {
    setEditingNoteId(null)
    setEditingNoteValue("")
  }

  async function handleSaveNote(id: string) {
    setSavingNote(true)
    try {
      const res = await fetch(apiPath(`/api/schedule/shifts/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingNoteValue.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to update note")
      }
      toast.success("Note updated")
      cancelEditNote()
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update note")
    } finally {
      setSavingNote(false)
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
          {assignments.map((a) =>
            editingNoteId === a.id ? (
              <li key={a.id} className="space-y-1 text-sm">
                <span className="truncate block">{displayName(a.name)}</span>
                <div className="flex items-center gap-1">
                  <Input
                    value={editingNoteValue}
                    onChange={(e) => setEditingNoteValue(e.target.value)}
                    placeholder="Note"
                    className="h-6 text-base px-1.5 flex-1 min-w-0"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Save note"
                    onClick={() => handleSaveNote(a.id)}
                    disabled={savingNote}
                  >
                    <Check className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Cancel"
                    onClick={cancelEditNote}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ) : (
              <li key={a.id} className="space-y-0.5 text-sm">
                <div className="flex items-center justify-between gap-1">
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
                  </span>
                  <span className="flex items-center shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit note for ${a.name}`}
                      onClick={() => startEditNote(a)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => handleRemove(a.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </span>
                </div>
                {a.note && (
                  <p className="truncate text-xs text-muted-foreground" title={a.note}>
                    {a.note}
                  </p>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}
