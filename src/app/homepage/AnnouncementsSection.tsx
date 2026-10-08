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
import { DeleteConfirm, FormFooter, useDialog, useFormRun } from "./form-parts"

/** "ready" once the first fetch has returned; "failed" only when there's no data to show. */
export type AnnouncementsLoadState = "loading" | "failed" | "ready"

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
  const { saving, run } = useFormRun(onClose)
  const [confirming, setConfirming] = useState(false)

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

      <FormFooter
        saving={saving}
        submitLabel={isCreate ? "Post" : "Save"}
        onClose={onClose}
        onRequestDelete={onDelete ? () => setConfirming(true) : undefined}
      />
    </form>
  )
}

function AnnouncementItem({
  announcement: a,
  meta,
  onEdit,
}: {
  announcement: AnnouncementRecord
  meta: string
  onEdit?: () => void
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
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
        {a.body && <p className="text-sm whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{a.body}</p>}
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      {onEdit && (
        <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label={`Edit ${a.title}`}>
          <Pencil />
        </Button>
      )}
    </li>
  )
}

/**
 * Homepage announcements above the links. Hidden entirely when there are
 * none, except in edit mode, where admins get the "Add announcement" control
 * and the recently ended ones (past 3 days) to extend or delete.
 */
export function AnnouncementsSection({
  announcements,
  recentlyEnded,
  loadState,
  editMode,
  mutate,
}: {
  announcements: AnnouncementRecord[]
  recentlyEnded: AnnouncementRecord[]
  loadState: AnnouncementsLoadState
  editMode: boolean
  mutate: KeyedMutator<AnnouncementsResponse>
}) {
  // value null = new announcement
  const dialog = useDialog<AnnouncementRecord | null>()

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

  if (!editMode && announcements.length === 0) return null

  // In edit mode an empty list must not read as "none" until the fetch has
  // actually returned — otherwise an admin might re-post an existing one.
  let emptyMessage = "No current announcements."
  if (loadState === "loading") emptyMessage = "Loading announcements…"
  else if (loadState === "failed") emptyMessage = "Announcements couldn't be loaded. Refresh to try again."

  return (
    <section aria-labelledby="announcements-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="announcements-heading" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Announcements
        </h2>
        {editMode && loadState === "ready" && (
          <Button variant="outline" size="sm" onClick={() => dialog.show(null)}>
            <Plus className="size-4" />
            Add announcement
          </Button>
        )}
      </div>

      {announcements.length > 0 ? (
        <ul className="divide-y rounded-lg border bg-muted/40">
          {announcements.map((a) => (
            <AnnouncementItem
              key={a.id}
              announcement={a}
              meta={
                `Posted ${formatPosted(a.createdAt)}` +
                (editMode ? (a.endDate ? ` · Shown through ${formatDay(a.endDate)}` : " · No end date") : "")
              }
              onEdit={editMode ? () => dialog.show(a) : undefined}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {editMode && recentlyEnded.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-medium text-muted-foreground">Recently ended, no longer shown</h3>
          <ul className="divide-y rounded-lg border border-dashed opacity-75">
            {recentlyEnded.map((a) => (
              <AnnouncementItem
                key={a.id}
                announcement={a}
                meta={`Posted ${formatPosted(a.createdAt)} · Ended ${formatDay(a.endDate!)}`}
                onEdit={() => dialog.show(a)}
              />
            ))}
          </ul>
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => !open && dialog.close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.value ? "Edit announcement" : "Add announcement"}</DialogTitle>
          </DialogHeader>
          {dialog.open || dialog.key > 0 ? (
            <AnnouncementForm
              key={dialog.key}
              isCreate={!dialog.value}
              initial={{
                title: dialog.value?.title ?? "",
                body: dialog.value?.body ?? "",
                url: dialog.value?.url ?? "",
                endDate: dialog.value?.endDate ?? "",
              }}
              onSave={(data) => save(dialog.value, data)}
              onDelete={dialog.value ? () => remove(dialog.value!) : undefined}
              onClose={dialog.close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
