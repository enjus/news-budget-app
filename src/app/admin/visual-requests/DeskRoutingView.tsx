"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { apiPath } from "@/lib/api-path"
import { formatTimestampPacific } from "@/lib/utils"
import { validateEmailList, type DeskRecipientSource, type DeskType } from "@/lib/visual-desk-routing"
import { VISUAL_TYPE_LABELS } from "@/lib/visual-types"

/** One entry of GET /api/admin/visual-desk-routing. */
interface DeskRoutingEntry {
  type: DeskType
  saved: string[] | null
  updatedAt: string | null
  updatedByName: string | null
  envVar: string
  envEmails: string[]
  effective: string[]
  source: DeskRecipientSource
}

const TEXTAREA_CLASS =
  "w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"

const SOURCE_NOTE: Record<DeskRecipientSource, string> = {
  table: "",
  "graphic table": " (following Graphic)",
  env: " (server default)",
  none: "",
}

function DeskCard({ entry, onSaved }: { entry: DeskRoutingEntry; onSaved: () => void }) {
  const initial = (entry.saved ?? []).join(", ")
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const label = VISUAL_TYPE_LABELS[entry.type]
  const local = validateEmailList(draft)
  const errors = !local.ok ? local.errors.map((e) => e.message) : serverErrors
  const dirty = draft.trim() !== initial
  const clearing = local.ok && local.emails.length === 0 && entry.saved !== null

  async function save() {
    if (!local.ok) return
    setSaving(true)
    setServerErrors([])
    try {
      const res = await fetch(apiPath("/api/admin/visual-desk-routing"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entry.type, emails: draft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const list: { message: string }[] | undefined = json?.errors
        setServerErrors(list?.map((e) => e.message) ?? [json?.error ?? `Couldn't save (${res.status})`])
        return
      }
      // Show the stored (normalized) form.
      const saved = (json.entries as DeskRoutingEntry[] | undefined)?.find((e) => e.type === entry.type)
      setDraft((saved?.saved ?? []).join(", "))
      toast.success(clearing ? `${label} requests now use the fallback` : `${label} routing saved`)
      onSaved()
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const fallback =
    entry.type === "MAP"
      ? "Graphic's list"
      : entry.envEmails.length > 0
        ? `the server default (${entry.envEmails.join(", ")})`
        : "the server default, which is empty"

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{label}</h2>
        <p className="text-xs text-muted-foreground">
          {entry.saved
            ? `Last changed by ${entry.updatedByName ?? "a deleted user"}, ${entry.updatedAt ? formatTimestampPacific(entry.updatedAt) : ""}`
            : "Not set here"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`desk-${entry.type}`}>Addresses</Label>
        <textarea
          id={`desk-${entry.type}`}
          className={TEXTAREA_CLASS}
          rows={2}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Comma-separated. Leave blank to use ${fallback}.`}
          value={draft}
          aria-invalid={errors.length > 0}
          onChange={(e) => {
            setDraft(e.target.value)
            setServerErrors([])
          }}
        />
        {errors.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground">Sending to: </span>
          {entry.effective.length > 0 ? (
            <>
              {entry.effective.join(", ")}
              <span className="text-muted-foreground">{SOURCE_NOTE[entry.source]}</span>
            </>
          ) : (
            <span className="text-destructive">nobody. {label} requests won&apos;t email the desk.</span>
          )}
        </p>
        <Button size="sm" onClick={save} disabled={!dirty || !local.ok || saving}>
          {saving ? "Saving..." : clearing ? "Clear and use fallback" : "Save"}
        </Button>
      </div>
    </section>
  )
}

/**
 * /admin/visual-requests: where each type's desk email goes. A saved list wins
 * over the server's VISUAL_REQUEST_EMAILS_* env var; Map follows Graphic unless
 * it has its own. Spec: docs/visual-requests-slice-3.md §14.
 */
export function DeskRoutingView() {
  const { data, isLoading, error, mutate } = useSWR<{ entries: DeskRoutingEntry[] }>("/api/admin/visual-desk-routing")

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Visual requests</h1>
        <p className="text-sm text-muted-foreground">
          Where the desk email goes when someone files a visual request. A list saved here replaces the server
          default for that type. Map uses Graphic&apos;s list unless you give it its own.
        </p>
        <p className="text-sm text-muted-foreground">
          Clearing a list returns that type to the server default. It doesn&apos;t turn the email off.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load desk routing. Try reloading the page.</p>
      ) : (
        <div className="space-y-4">
          {data.entries.map((entry) => (
            // Keyed on the saved list too, so a save elsewhere resets this card's draft.
            <DeskCard key={`${entry.type}:${(entry.saved ?? []).join(",")}`} entry={entry} onSaved={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  )
}
