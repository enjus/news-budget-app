import { Button } from "@/components/ui/button"

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
