"use client"

import { useState } from "react"
import type { KeyedMutator } from "swr"
import { toast } from "sonner"
import { ArrowUpRight, ChevronDown, ChevronUp, Pencil, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { LinkCategoryRecord, LinksResponse, NewsroomLinkRecord } from "@/lib/hooks/useLinks"
import { sendJSON } from "@/lib/send-json"
import type { AnnouncementRecord, AnnouncementsResponse } from "@/lib/hooks/useAnnouncements"
import { DeleteConfirm, FormFooter, useDialog, useFormRun } from "./form-parts"
import { AnnouncementsSection, type AnnouncementsLoadState } from "./AnnouncementsSection"

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function linkMatches(link: NewsroomLinkRecord, needle: string) {
  return [link.title, link.url, link.note ?? ""].some((s) => s.toLowerCase().includes(needle))
}

/** Links to show for a filter; a category whose name matches shows all of its links. */
function filterLinks(category: LinkCategoryRecord, q: string) {
  const needle = q.toLowerCase()
  if (!needle || category.name.toLowerCase().includes(needle)) return category.links
  return category.links.filter((l) => linkMatches(l, needle))
}

interface LinkFormData {
  title: string
  url: string
  note: string
  categoryId: string
}

function LinkForm({
  initial,
  categories,
  isCreate,
  onSave,
  onDelete,
  onClose,
}: {
  initial: LinkFormData
  categories: LinkCategoryRecord[]
  isCreate: boolean
  onSave: (data: LinkFormData) => Promise<void>
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
        <Label htmlFor="link-title">Link text</Label>
        <Input
          id="link-title"
          value={data.title}
          onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
          required
          maxLength={80}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="link-url">URL</Label>
        <Input
          id="link-url"
          type="url"
          inputMode="url"
          value={data.url}
          onChange={(e) => setData((d) => ({ ...d, url: e.target.value }))}
          required
          maxLength={2000}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="link-note">
          Note <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="link-note"
          value={data.note}
          onChange={(e) => setData((d) => ({ ...d, note: e.target.value }))}
          maxLength={80}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="link-category">Category</Label>
        <Select value={data.categoryId} onValueChange={(categoryId) => setData((d) => ({ ...d, categoryId }))}>
          <SelectTrigger id="link-category" className="w-full text-base md:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {confirming && onDelete && (
        <DeleteConfirm
          message={`Delete "${initial.title}"? This can't be undone.`}
          confirmLabel="Delete link"
          busy={saving}
          onCancel={() => setConfirming(false)}
          onConfirm={() => run(onDelete)}
        />
      )}

      <FormFooter
        saving={saving}
        submitLabel={isCreate ? "Add link" : "Save"}
        onClose={onClose}
        onRequestDelete={onDelete ? () => setConfirming(true) : undefined}
      />
    </form>
  )
}

function CategoryForm({
  initial,
  linkCount,
  isCreate,
  onSave,
  onDelete,
  onClose,
}: {
  initial: string
  linkCount: number
  isCreate: boolean
  onSave: (name: string) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const { saving, run } = useFormRun(onClose)
  const [confirming, setConfirming] = useState(false)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(() => onSave(name))
      }}
      className="space-y-4 pt-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
      </div>

      {confirming &&
        onDelete &&
        (linkCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 px-3 py-2 text-sm">
            <span className="min-w-40 flex-1">
              Move or delete its {linkCount} link{linkCount === 1 ? "" : "s"} first. Only an empty category can be
              deleted.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
              OK
            </Button>
          </div>
        ) : (
          <DeleteConfirm
            message={`Delete "${initial}"?`}
            confirmLabel="Delete category"
            busy={saving}
            onCancel={() => setConfirming(false)}
            onConfirm={() => run(onDelete)}
          />
        ))}

      <FormFooter
        saving={saving}
        submitLabel={isCreate ? "Add category" : "Save"}
        onClose={onClose}
        onRequestDelete={onDelete ? () => setConfirming(true) : undefined}
      />
    </form>
  )
}

type LinkDialogState = { categoryId: string; link: NewsroomLinkRecord | null }
type CategoryDialogState = { category: LinkCategoryRecord | null }

export function LinksView({
  categories,
  isLoading,
  loadFailed,
  isAdmin,
  mutate,
  announcements,
  recentlyEnded,
  announcementsState,
  mutateAnnouncements,
}: {
  categories: LinkCategoryRecord[]
  isLoading: boolean
  /** True only when there's nothing to show — a failed background refresh keeps the cached links on screen. */
  loadFailed: boolean
  isAdmin: boolean
  mutate: KeyedMutator<LinksResponse>
  announcements: AnnouncementRecord[]
  recentlyEnded: AnnouncementRecord[]
  announcementsState: AnnouncementsLoadState
  mutateAnnouncements: KeyedMutator<AnnouncementsResponse>
}) {
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState(false)
  const linkDialog = useDialog<LinkDialogState>()
  const categoryDialog = useDialog<CategoryDialogState>()
  // One reorder at a time: the arrows are disabled while a move is saving, so
  // each click starts from the order the server already has.
  const [reordering, setReordering] = useState(false)

  const editMode = isAdmin && editing
  const q = query.trim()

  async function reorderCategories(next: LinkCategoryRecord[]) {
    setReordering(true)
    mutate({ categories: next }, { revalidate: false })
    try {
      await sendJSON("/api/admin/link-categories/order", "PUT", { ids: next.map((c) => c.id) }, "Failed to reorder categories")
    } catch {
      // Toast already shown; put back the server's order.
      await mutate()
    } finally {
      setReordering(false)
    }
  }

  async function reorderLinks(categoryId: string, nextLinks: NewsroomLinkRecord[]) {
    setReordering(true)
    mutate(
      { categories: categories.map((c) => (c.id === categoryId ? { ...c, links: nextLinks } : c)) },
      { revalidate: false }
    )
    try {
      await sendJSON("/api/admin/links/order", "PUT", { categoryId, ids: nextLinks.map((l) => l.id) }, "Failed to reorder links")
    } catch {
      // Toast already shown; put back the server's order.
      await mutate()
    } finally {
      setReordering(false)
    }
  }

  async function saveLink(state: LinkDialogState, data: LinkFormData) {
    const body = { ...data, note: data.note || null }
    if (state.link) {
      await sendJSON(`/api/admin/links/${state.link.id}`, "PATCH", body, "Failed to save link")
      toast.success("Link saved")
    } else {
      await sendJSON("/api/admin/links", "POST", body, "Failed to add link")
      toast.success("Link added")
    }
    await mutate()
  }

  async function deleteLink(link: NewsroomLinkRecord) {
    await sendJSON(`/api/admin/links/${link.id}`, "DELETE", null, "Failed to delete link")
    toast.success("Link deleted")
    await mutate()
  }

  async function saveCategory(category: LinkCategoryRecord | null, name: string) {
    if (category) {
      await sendJSON(`/api/admin/link-categories/${category.id}`, "PATCH", { name }, "Failed to save category")
      toast.success("Category saved")
    } else {
      await sendJSON("/api/admin/link-categories", "POST", { name }, "Failed to add category")
      toast.success("Category added")
    }
    await mutate()
  }

  async function deleteCategory(category: LinkCategoryRecord) {
    await sendJSON(`/api/admin/link-categories/${category.id}`, "DELETE", null, "Failed to delete category")
    toast.success("Category deleted")
    await mutate()
  }

  const visible = categories
    .map((c) => ({ category: c, shown: filterLinks(c, q) }))
    .filter(({ shown }) => editMode || !q || shown.length > 0)

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      {/* No visible heading — the masthead says where you are; this one is for screen readers. */}
      <h1 className="sr-only">Newsroom</h1>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="links-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter links"
            aria-label="Filter links"
            autoComplete="off"
            className="pl-8"
          />
        </div>
        {isAdmin && (
          <Button
            variant={editing ? "default" : "outline"}
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
          >
            <Pencil className="size-4" />
            {editing ? "Done editing" : "Edit page"}
          </Button>
        )}
      </div>

      <AnnouncementsSection
        announcements={announcements}
        recentlyEnded={recentlyEnded}
        loadState={announcementsState}
        editMode={editMode}
        mutate={mutateAnnouncements}
      />

      {visible.length > 1 && (
        <nav aria-label="Jump to category" className="flex flex-wrap gap-1.5">
          {visible.map(({ category: c }) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="rounded-full border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {c.name}
            </a>
          ))}
        </nav>
      )}

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-lg" />
          ))}
        </div>
      ) : loadFailed ? (
        <p className="text-sm text-muted-foreground">Links couldn&apos;t be loaded. Refresh to try again.</p>
      ) : (
        <>
          {categories.length === 0 && !editMode && <p className="text-sm text-muted-foreground">No links yet.</p>}
          {q && visible.length === 0 && categories.length > 0 && (
            <p className="text-sm text-muted-foreground">No links match &ldquo;{q}&rdquo;.</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] items-start gap-4">
            {visible.map(({ category, shown }) => {
              const ci = categories.indexOf(category)
              return (
                <section
                  key={category.id}
                  id={`cat-${category.id}`}
                  className="flex min-w-0 scroll-mt-20 flex-col rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-1 border-b px-3.5 py-2.5">
                    <h2 className="min-w-0 flex-1 text-xs font-semibold tracking-wider uppercase">{category.name}</h2>
                    {editMode && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={reordering || ci === 0}
                          onClick={() => reorderCategories(swap(categories, ci, ci - 1))}
                          aria-label={`Move ${category.name} earlier`}
                        >
                          <ChevronUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={reordering || ci === categories.length - 1}
                          onClick={() => reorderCategories(swap(categories, ci, ci + 1))}
                          aria-label={`Move ${category.name} later`}
                        >
                          <ChevronDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => categoryDialog.show({ category })}
                          aria-label={`Edit category ${category.name}`}
                        >
                          <Pencil />
                        </Button>
                      </>
                    )}
                  </div>

                  {shown.length > 0 ? (
                    <ul className="flex flex-col p-1.5">
                      {shown.map((link) => {
                        const li = category.links.indexOf(link)
                        return (
                          <li key={link.id} className="group flex min-w-0 items-center gap-2.5 rounded-md p-2 hover:bg-accent/60">
                            <span
                              aria-hidden
                              className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted text-[11px] font-semibold text-muted-foreground uppercase"
                            >
                              {link.title.trim()[0] ?? "?"}
                            </span>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex min-w-0 flex-1 flex-col"
                            >
                              <span className="font-medium [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-2">
                                {link.title}
                              </span>
                              {link.note && <span className="text-xs text-muted-foreground">{link.note}</span>}
                              <span className="truncate font-mono text-[11px] text-muted-foreground">{hostOf(link.url)}</span>
                            </a>
                            {editMode ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={reordering || li === 0 || !!q}
                                  onClick={() => reorderLinks(category.id, swap(category.links, li, li - 1))}
                                  aria-label={`Move ${link.title} up`}
                                >
                                  <ChevronUp />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={reordering || li === category.links.length - 1 || !!q}
                                  onClick={() => reorderLinks(category.id, swap(category.links, li, li + 1))}
                                  aria-label={`Move ${link.title} down`}
                                >
                                  <ChevronDown />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => linkDialog.show({ categoryId: category.id, link })}
                                  aria-label={`Edit ${link.title}`}
                                >
                                  <Pencil />
                                </Button>
                              </>
                            ) : (
                              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" />
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="px-3.5 py-3 text-sm text-muted-foreground">
                      {category.links.length ? "No matches in this category." : "No links yet."}
                    </p>
                  )}

                  {editMode && (
                    <button
                      type="button"
                      onClick={() => linkDialog.show({ categoryId: category.id, link: null })}
                      className="mx-1.5 mb-2 flex items-center gap-2 rounded-md border border-dashed p-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      Add link
                    </button>
                  )}
                </section>
              )
            })}

            {editMode && (
              <button
                type="button"
                onClick={() => categoryDialog.show({ category: null })}
                className="flex min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground"
              >
                <Plus className="size-4" />
                Add category
              </button>
            )}
          </div>
        </>
      )}

      <Dialog open={linkDialog.open} onOpenChange={(open) => !open && linkDialog.close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkDialog.value?.link ? "Edit link" : "Add link"}</DialogTitle>
          </DialogHeader>
          {linkDialog.value && (
            <LinkForm
              key={linkDialog.key}
              isCreate={!linkDialog.value.link}
              categories={categories}
              initial={{
                title: linkDialog.value.link?.title ?? "",
                url: linkDialog.value.link?.url ?? "https://",
                note: linkDialog.value.link?.note ?? "",
                categoryId: linkDialog.value.categoryId,
              }}
              onSave={(data) => saveLink(linkDialog.value!, data)}
              onDelete={linkDialog.value.link ? () => deleteLink(linkDialog.value!.link!) : undefined}
              onClose={linkDialog.close}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialog.open} onOpenChange={(open) => !open && categoryDialog.close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog.value?.category ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          {categoryDialog.value && (
            <CategoryForm
              key={categoryDialog.key}
              isCreate={!categoryDialog.value.category}
              initial={categoryDialog.value.category?.name ?? ""}
              linkCount={categoryDialog.value.category?.links.length ?? 0}
              onSave={(name) => saveCategory(categoryDialog.value!.category, name)}
              onDelete={
                categoryDialog.value.category ? () => deleteCategory(categoryDialog.value!.category!) : undefined
              }
              onClose={categoryDialog.close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
