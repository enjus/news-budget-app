"use client"

import { useState } from "react"
import type { KeyedMutator } from "swr"
import { toast } from "sonner"
import { ArrowUpRight, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AnnouncementRecord, AnnouncementsResponse } from "@/lib/hooks/useAnnouncements"
import { sendJSON } from "@/lib/send-json"
import { dateOnly, todayString } from "@/lib/utils"
import { DeleteConfirm } from "./DeleteConfirm"

/** "YYYY-MM-DD" newsroom date → "Oct 10" (UTC fields, so the day never shifts). */
function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(dateOnly(date))
}

/** A real instant → its Pacific calendar day, "Oct 6". */
function formatPosted(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }).format(
    new Date(iso)
  )
}

interface AnnouncementFormData {
  title: string
  body: string
  url: string
  endDate: string
}

function AnnouncementForm({
  initial,
  isCreate,
  onSave,
  onDelete,
  onClose,
}: {
  initial: AnnouncementFormData
  isCreate: boolean
  onSave: (data: AnnouncementFormData) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const [data, setData] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function run(action: () => Promise<void>) {
    setSaving(true)
    try {
      await action()
      onClose()
    } catch {
      // error toast handled in sendJSON()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(() => onSave(data))
      }}
      className="space-y-4 pt-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ann-title">Headline</Label>
        <Input
          id="ann-title"
          value={data.title}
          onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ann-body">
          Details <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="ann-body"
          value={data.body}
          onChange={(e) => setData((d) => ({ ...d, body: e.target.value }))}
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border bg-background px-3 py-2 text-base md:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ann-url">
          Link <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="ann-url"
          type="url"
          inputMode="url"
          value={data.url}
          onChange={(e) => setData((d) => ({ ...d, url: e.target.value }))}
          maxLength={2000}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ann-end">
          Last day shown <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="ann-end"
          type="date"
          value={data.endDate}
          min={todayString()}
          onChange={(e) => setData((d) => ({ ...d, endDate: e.target.value }))}
          className="w-auto"
        />
        <p className="text-xs text-muted-foreground">Leave blank to keep it up until you delete it.</p>
      </div>

      {confirming && onDelete && (
        <DeleteConfirm
          message="Delete this announcement?"
          confirmLabel="Delete announcement"
          busy={saving}
          onCancel={() => setConfirming(false)}
          onConfirm={() => run(onDelete)}
        />
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onDelete && (
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
              disabled={saving}
            >
              Delete
            </Button>
            <span className="flex-1" />
          </>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isCreate ? "Post" : "Save"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Homepage announcements above the links. Hidden entirely when there are
 * none, except in edit mode, where admins get the "Add announcement" control.
 */
export function AnnouncementsSection({
  announcements,
  editMode,
  mutate,
}: {
  announcements: AnnouncementRecord[]
  editMode: boolean
  mutate: KeyedMutator<AnnouncementsResponse>
}) {
  // undefined = closed, null = new, record = editing
  const [dialog, setDialog] = useState<AnnouncementRecord | null | undefined>(undefined)

  async function save(existing: AnnouncementRecord | null, data: AnnouncementFormData) {
    const body = { ...data, body: data.body || null, url: data.url || null, endDate: data.endDate || null }
    if (existing) {
      await sendJSON(`/api/admin/announcements/${existing.id}`, "PATCH", body, "Failed to save announcement")
      toast.success("Announcement saved")
    } else {
      await sendJSON("/api/admin/announcements", "POST", body, "Failed to post announcement")
      toast.success("Announcement posted")
    }
    await mutate()
  }

  async function remove(existing: AnnouncementRecord) {
    await sendJSON(`/api/admin/announcements/${existing.id}`, "DELETE", null, "Failed to delete announcement")
    toast.success("Announcement deleted")
    await mutate()
  }

  if (announcements.length === 0 && !editMode) return null

  return (
    <section aria-labelledby="announcements-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="announcements-heading" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Announcements
        </h2>
        {editMode && (
          <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
            <Plus className="size-4" />
            Add announcement
          </Button>
        )}
      </div>

      {announcements.length > 0 ? (
        <ul className="divide-y rounded-lg border bg-muted/40">
          {announcements.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium [overflow-wrap:anywhere]">
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline hover:underline-offset-2"
                    >
                      {a.title}
                      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ) : (
                    a.title
                  )}
                </p>
                {a.body && (
                  <p className="text-sm whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{a.body}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Posted {formatPosted(a.createdAt)}
                  {editMode && (a.endDate ? ` · Shown through ${formatDay(a.endDate)}` : " · No end date")}
                </p>
              </div>
              {editMode && (
                <Button variant="ghost" size="icon-xs" onClick={() => setDialog(a)} aria-label={`Edit ${a.title}`}>
                  <Pencil />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No announcements.</p>
      )}

      <Dialog open={dialog !== undefined} onOpenChange={(open) => !open && setDialog(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog ? "Edit announcement" : "Add announcement"}</DialogTitle>
          </DialogHeader>
          {dialog !== undefined && (
            <AnnouncementForm
              key={dialog?.id ?? "new"}
              isCreate={!dialog}
              initial={{
                title: dialog?.title ?? "",
                body: dialog?.body ?? "",
                url: dialog?.url ?? "",
                endDate: dialog?.endDate ?? "",
              }}
              onSave={(data) => save(dialog, data)}
              onDelete={dialog ? () => remove(dialog) : undefined}
              onClose={() => setDialog(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
