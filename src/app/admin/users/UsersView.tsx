"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AdminUser {
  id: string
  email: string
  name: string
  appRole: string
  personId: string | null
  createdAt: string
  person: { name: string } | null
}

interface UserFormData {
  name: string
  email: string
  password: string
  appRole: string
}

function UserForm({
  initial,
  onSave,
  onClose,
  isCreate,
}: {
  initial?: Partial<AdminUser>
  onSave: (data: UserFormData) => Promise<void>
  onClose: () => void
  isCreate: boolean
}) {
  const [data, setData] = useState<UserFormData>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    password: "",
    appRole: initial?.appRole ?? "EDITOR",
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isCreate && !data.password) return
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
        <Label htmlFor="u-name">Name</Label>
        <Input
          id="u-name"
          value={data.name}
          onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-email">Email</Label>
        <Input
          id="u-email"
          type="email"
          value={data.email}
          onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-password">
          {isCreate ? "Password" : "New password (leave blank to keep)"}
        </Label>
        <Input
          id="u-password"
          type="password"
          value={data.password}
          onChange={(e) => setData((d) => ({ ...d, password: e.target.value }))}
          required={isCreate}
          placeholder={isCreate ? "" : "Leave blank to keep current"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-role">Role</Label>
        <Select value={data.appRole} onValueChange={(v) => setData((d) => ({ ...d, appRole: v }))}>
          <SelectTrigger id="u-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="EDITOR">Editor</SelectItem>
            <SelectItem value="VIEWER">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isCreate ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  )
}

export function UsersView() {
  const { data, isLoading, mutate } = useSWR<{ users: AdminUser[] }>("/api/admin/users", fetcher)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)

  async function handleCreate(formData: UserFormData) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to create user")
      throw new Error()
    }
    toast.success("User created")
    await mutate()
  }

  async function handleEdit(userId: string, formData: UserFormData) {
    const body: Record<string, string> = {
      name: formData.name,
      email: formData.email,
      appRole: formData.appRole,
    }
    if (formData.password) body.password = formData.password

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Failed to update user")
      throw new Error()
    }
    toast.success("User updated")
    await mutate()
  }

  async function handleDelete(user: AdminUser) {
    if (!confirm(`Delete user "${user.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
    if (!res.ok) {
      const err = res.status !== 204 ? await res.json() : {}
      toast.error(err.error ?? "Failed to delete user")
    } else {
      toast.success("User deleted")
      await mutate()
    }
  }

  const users = data?.users ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              New User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New User</DialogTitle>
            </DialogHeader>
            <UserForm
              isCreate
              onSave={handleCreate}
              onClose={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Email</th>
                <th className="px-4 py-2.5 text-left font-medium">Role</th>
                <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Linked Person</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          user.appRole === "ADMIN"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {user.appRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {user.person?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Dialog
                          open={editingUserId === user.id}
                          onOpenChange={(open) => setEditingUserId(open ? user.id : null)}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Edit user">
                              <Pencil className="size-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit User</DialogTitle>
                            </DialogHeader>
                            <UserForm
                              isCreate={false}
                              initial={user}
                              onSave={(formData) => handleEdit(user.id, formData)}
                              onClose={() => setEditingUserId(null)}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete user"
                          onClick={() => handleDelete(user)}
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
