"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

/**
 * Dialog state that survives the close animation: `value` keeps the last
 * item shown while `open` goes false, so the title and form don't flip to
 * their "Add" state mid-fade. `key` changes on every show() so the form
 * remounts with fresh state.
 */
export function useDialog<T>() {
  const [state, setState] = useState<{ value: T | null; open: boolean; key: number }>({
    value: null,
    open: false,
    key: 0,
  })
  return {
    ...state,
    show: (value: T) => setState((s) => ({ value, open: true, key: s.key + 1 })),
    close: () => setState((s) => ({ ...s, open: false })),
  }
}

/**
 * Runs a save or delete, then closes the dialog on success. Errors (server
 * or network) are already toasted by sendJSON(), so a failure just leaves
 * the dialog open with the admin's input intact.
 */
export function useFormRun(onClose: () => void) {
  const [saving, setSaving] = useState(false)
  async function run(action: () => Promise<void>) {
    setSaving(true)
    try {
      await action()
      onClose()
    } catch {
      // toasted in sendJSON()
    } finally {
      setSaving(false)
    }
  }
  return { saving, run }
}

/** In-dialog delete confirmation (no browser confirm()). */
export function DeleteConfirm({
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  message: string
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 px-3 py-2 text-sm">
      <span className="min-w-40 flex-1">{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
        Keep
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
        {busy ? "Deleting..." : confirmLabel}
      </Button>
    </div>
  )
}

/** Delete (when editing) on the left; Cancel and the submit button on the right. */
export function FormFooter({
  saving,
  submitLabel,
  onClose,
  onRequestDelete,
}: {
  saving: boolean
  submitLabel: string
  onClose: () => void
  /** Omit when creating — there's nothing to delete yet. */
  onRequestDelete?: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      {onRequestDelete && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onRequestDelete}
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
        {saving ? "Saving..." : submitLabel}
      </Button>
    </div>
  )
}
