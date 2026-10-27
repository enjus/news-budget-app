import { X } from "lucide-react"
import { languageLabel } from "@/lib/languages"

/** A language pill; pass `onRemove` to add a remove button (LanguagePicker). */
export function LanguageChip({ code, onRemove }: { code: string; onRemove?: () => void }) {
  const label = languageLabel(code)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="rounded-full hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
