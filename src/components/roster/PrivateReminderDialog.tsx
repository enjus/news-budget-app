"use client"

import { ShieldAlert } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Once-per-browser-session reminder before personal contact details are shown.
// A courtesy, not a gate: the data is already in the profile payload, and
// nothing is recorded server-side (by design — users are trusted).
const STORAGE_KEY = "roster-private-ack"

/** Whether the reminder was acknowledged this browser session. Read at click
 *  time, never during render (sessionStorage doesn't exist during SSR). */
export function hasPrivateAck(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function setPrivateAck(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1")
  } catch {
    // Storage blocked (private mode etc.) — the reminder just shows again next time.
  }
}

export function PrivateReminderDialog({
  open,
  onOpenChange,
  onConfirm,
  extra,
  confirmLabel = "I understand",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  /** An additional paragraph, e.g. the CSV download's storage guidance. */
  extra?: React.ReactNode
  confirmLabel?: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5" />
            Confidential
          </AlertDialogTitle>
          <AlertDialogDescription>
            Personal phone numbers, emails, and home addresses are for internal
            newsroom use only and are not for public distribution. Please don&apos;t
            share them outside the newsroom.
          </AlertDialogDescription>
          {extra && <AlertDialogDescription>{extra}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
