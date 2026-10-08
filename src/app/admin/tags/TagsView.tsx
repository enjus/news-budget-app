"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Plus, Pencil, Archive, ArchiveRestore, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useTags, type TagRecord } from "@/lib/hooks/useTags"
import { TAG_COLORS, TAG_COLOR_KEYS, TAG_ICON_KEYS, tagHref, type TagColorKey } from "@/lib/tags"
import { TAG_ICONS } from "@/components/tags/tag-icons"
import { TagChip } from "@/components/tags/TagChip"
import { BUILTIN_INDICATORS, cn } from "@/lib/utils"
import { sendJSON } from "@/lib/send-json"

interface TagFormData {
  label: string
  abbrev: string
  color: TagColorKey
  icon: string | null
}

function TagForm({
  initial,
  onSave,
  onClose,
  isCreate,
}: {
  initial?: TagFormData
  onSave: (data: TagFormData) => Promise<void>
  onClose: () => void
  isCreate: boolean
}) {
  const [data, setData] = useState<TagFormData>(
    initial ?? { label: "", abbrev: "", color: TAG_COLOR_KEYS[0], icon: null }
  )
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
        <Label htmlFor="tag-label">Name</Label>
        <Input
          id="tag-label"
          value={data.label}
          onChange={(e) => setData((d) => ({ ...d, label: e.target.value }))}
          required
          maxLength={40}
          placeholder="e.g. Election 2026"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tag-abbrev">Abbreviation</Label>
        <Input
          id="tag-abbrev"
          value={data.abbrev}
          onChange={(e) => setData((d) => ({ ...d, abbrev: e.target.value }))}
          maxLength={12}
          placeholder="Optional — shown on budget cards instead of the name"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {TAG_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setData((d) => ({ ...d, color: key }))}
              aria-label={TAG_COLORS[key].label}
              aria-pressed={data.color === key}
              title={TAG_COLORS[key].label}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                TAG_COLORS[key].swatch,
                data.color === key ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-muted-foreground/40"
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setData((d) => ({ ...d, icon: null }))}
            aria-pressed={data.icon === null}
            className={cn(
              "flex h-8 items-center rounded-md border px-2 text-xs text-muted-foreground",
              data.icon === null ? "border-foreground text-foreground" : "hover:bg-accent"
            )}
          >
            None
          </button>
          {TAG_ICON_KEYS.map((key) => {
            const Icon = TAG_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setData((d) => ({ ...d, icon: key }))}
                aria-label={key}
                aria-pressed={data.icon === key}
                title={key}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md border",
                  data.icon === key ? "border-foreground bg-accent" : "border-transparent hover:bg-accent"
                )}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Preview</span>
        <TagChip
          tagKey="PREVIEW"
          tag={{ key: "PREVIEW", label: data.label || "Tag name", abbrev: data.abbrev || null, color: data.color, icon: data.icon }}
          className="px-1.5 py-0.5 text-[10px]"
          iconClassName="size-3"
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

export function TagsView() {
  const { tags, isLoading, mutate } = useTags()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const active = tags.filter((t) => !t.archivedAt)
  const archived = tags.filter((t) => t.archivedAt)

  async function handleCreate(data: TagFormData) {
    await sendJSON("/api/admin/tags", "POST", { ...data, abbrev: data.abbrev || null }, "Failed to create tag")
    toast.success("Tag created")
    await mutate()
  }

  async function handleEdit(key: string, data: TagFormData) {
    await sendJSON(`/api/admin/tags/${key}`, "PATCH", { ...data, abbrev: data.abbrev || null }, "Failed to update tag")
    toast.success("Tag updated")
    await mutate()
  }

  async function handleArchive(tag: TagRecord, archive: boolean) {
    if (archive && !confirm(`Archive "${tag.label}"? It stays on existing stories but can't be added to new ones.`)) return
    try {
      await sendJSON(`/api/admin/tags/${tag.key}`, "PATCH", { archived: archive }, "Failed to update tag")
      toast.success(archive ? `Archived ${tag.label}` : `Restored ${tag.label}`)
      await mutate()
    } catch {
      // toast already shown
    }
  }

  function renderRow(tag: TagRecord) {
    return (
      <tr key={tag.key} className="border-b last:border-0 hover:bg-muted/30">
        <td className="px-4 py-3">
          <Link href={tagHref(tag.key)} className="hover:underline">
            <TagChip tagKey={tag.key} tag={tag} className="px-1.5 py-0.5 text-[10px]" iconClassName="size-3" />
          </Link>
        </td>
        <td className="px-4 py-3 font-medium">{tag.label}</td>
        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{tag.abbrev ?? "—"}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Dialog
              open={editingKey === tag.key}
              onOpenChange={(open) => setEditingKey(open ? tag.key : null)}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${tag.label}`}>
                  <Pencil className="size-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Tag</DialogTitle>
                </DialogHeader>
                <TagForm
                  isCreate={false}
                  initial={{
                    label: tag.label,
                    abbrev: tag.abbrev ?? "",
                    color: (tag.color in TAG_COLORS ? tag.color : TAG_COLOR_KEYS[0]) as TagColorKey,
                    icon: tag.icon,
                  }}
                  onSave={(data) => handleEdit(tag.key, data)}
                  onClose={() => setEditingKey(null)}
                />
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tag.archivedAt ? `Restore ${tag.label}` : `Archive ${tag.label}`}
              title={tag.archivedAt ? "Restore" : "Archive"}
              onClick={() => handleArchive(tag, !tag.archivedAt)}
            >
              {tag.archivedAt ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  const tableHead = (
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="px-4 py-2.5 text-left font-medium w-32">Chip</th>
        <th className="px-4 py-2.5 text-left font-medium">Name</th>
        <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Abbreviation</th>
        <th className="px-4 py-2.5 w-24" />
      </tr>
    </thead>
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tags</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              New Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Tag</DialogTitle>
            </DialogHeader>
            <TagForm isCreate onSave={handleCreate} onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              {tableHead}
              <tbody>
                {/* Built-ins: real Story/Video columns with special behavior — shown for reference, never editable */}
                {BUILTIN_INDICATORS.map((opt) => (
                  <tr key={opt.value} className="border-b bg-muted/20">
                    <td className="px-4 py-3">
                      {opt.value === "ENTERPRISE" ? (
                        <Badge variant="secondary">Enterprise</Badge>
                      ) : (
                        <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium", opt.color)}>
                          <Sparkles className="size-3" />
                          AI
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{opt.label}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">—</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 pr-2 text-xs text-muted-foreground" title="Built-in indicator — can't be edited or archived">
                        <Lock className="size-3.5" />
                        Built-in
                      </div>
                    </td>
                  </tr>
                ))}
                {active.map(renderRow)}
              </tbody>
            </table>
          </div>

          {archived.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Archived — still shown on existing stories, can&apos;t be added to new ones
              </h2>
              <div className="rounded-lg border overflow-hidden opacity-80">
                <table className="w-full text-sm">
                  {tableHead}
                  <tbody>{archived.map(renderRow)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
