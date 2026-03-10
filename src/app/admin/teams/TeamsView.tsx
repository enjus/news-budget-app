"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PersonPicker } from "@/components/people/PersonPicker"
import { useAdminTeams } from "@/lib/hooks/useTeams"
import { PERSON_ROLE_LABELS, TEAM_MEMBER_ROLE_LABELS } from "@/lib/utils"
import type { Person } from "@/types/index"

interface TeamFormData {
  name: string
  description: string
}

function TeamForm({
  initial,
  onSave,
  onClose,
  isCreate,
}: {
  initial?: Partial<TeamFormData>
  onSave: (data: TeamFormData) => Promise<void>
  onClose: () => void
  isCreate: boolean
}) {
  const [data, setData] = useState<TeamFormData>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(data)
      onClose()
    } catch {
      // error toast handled in onSave
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="t-name">Name</Label>
        <Input
          id="t-name"
          value={data.name}
          onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
          required
          placeholder="e.g. Metro, Sports, Investigations"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-desc">Description</Label>
        <Input
          id="t-desc"
          value={data.description}
          onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
          placeholder="Optional"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isCreate ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  )
}

function MembersDialog({
  team,
  onMutate,
}: {
  team: { id: string; name: string; members: Array<{ id: string; role: string; person: { id: string; name: string; defaultRole: string } }> }
  onMutate: () => void
}) {
  const [open, setOpen] = useState(false)
  const existingPersonIds = team.members.map((m) => m.person.id)

  async function handleAddMember(person: Person, role: string) {
    // Map PersonPicker role to TeamMemberRole
    const teamRole = role === "EDITOR" ? "EDITOR" : "MEMBER"
    const res = await fetch(`/api/admin/teams/${team.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: person.id, role: teamRole }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to add member")
      return
    }
    toast.success(`Added ${person.name} to ${team.name}`)
    onMutate()
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    const res = await fetch(`/api/admin/teams/${team.id}/members/${memberId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      toast.error("Failed to remove member")
      return
    }
    toast.success(`Removed ${memberName}`)
    onMutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Manage members">
          <Users className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{team.name} — Members</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Current members */}
          {team.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="space-y-1">
              {team.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.person.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {TEAM_MEMBER_ROLE_LABELS[m.role] ?? m.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {PERSON_ROLE_LABELS[m.person.defaultRole] ?? m.person.defaultRole}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveMember(m.id, m.person.name)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add member */}
          <div className="space-y-1.5">
            <Label>Add member</Label>
            <div className="flex flex-wrap items-center gap-2">
              <AddMemberRow
                excludeIds={existingPersonIds}
                onAdd={handleAddMember}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddMemberRow({
  excludeIds,
  onAdd,
}: {
  excludeIds: string[]
  onAdd: (person: Person, role: string) => void
}) {
  // Use PersonPicker with team-relevant roles
  return (
    <PersonPicker
      excludeIds={excludeIds}
      onSelect={onAdd}
      roles={["EDITOR", "OTHER"]}
      defaultRole="OTHER"
      label="Select person"
    />
  )
}

export function TeamsView() {
  const { teams, isLoading, mutate } = useAdminTeams()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)

  async function handleCreate(formData: TeamFormData) {
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.name,
        description: formData.description || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to create team")
      throw new Error()
    }
    toast.success("Team created")
    await mutate()
  }

  async function handleEdit(teamId: string, formData: TeamFormData) {
    const res = await fetch(`/api/admin/teams/${teamId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.name,
        description: formData.description || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to update team")
      throw new Error()
    }
    toast.success("Team updated")
    await mutate()
  }

  async function handleDelete(team: { id: string; name: string }) {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete team")
    } else {
      toast.success("Team deleted")
      await mutate()
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              New Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Team</DialogTitle>
            </DialogHeader>
            <TeamForm
              isCreate
              onSave={handleCreate}
              onClose={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Team</th>
                <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Description</th>
                <th className="px-4 py-2.5 text-left font-medium">Members</th>
                <th className="px-4 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No teams yet.
                  </td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr key={team.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{team.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {team.description ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">{team._count.members}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <MembersDialog team={team} onMutate={() => mutate()} />
                        <Dialog
                          open={editingTeamId === team.id}
                          onOpenChange={(open) => setEditingTeamId(open ? team.id : null)}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Edit team">
                              <Pencil className="size-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Team</DialogTitle>
                            </DialogHeader>
                            <TeamForm
                              isCreate={false}
                              initial={{ name: team.name, description: team.description ?? "" }}
                              onSave={(formData) => handleEdit(team.id, formData)}
                              onClose={() => setEditingTeamId(null)}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete team"
                          onClick={() => handleDelete(team)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
