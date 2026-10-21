"use client"

import { useEffect } from "react"

// The App Router has no cancelable route-change event, so the guard covers
// navigation at its sources: in-page link clicks (intercepted in the capture
// phase, ahead of next/link's handler), reload/close/external navigation
// (beforeunload — the browser shows its own generic text there), and
// programmatic navigation that calls confirmLeave() first (SearchCommand).
// Browser Back/Forward isn't covered.

let activeMessage: string | null = null

/** True if it's OK to navigate away — no guarded form is dirty, or the user confirmed. */
export function confirmLeave(): boolean {
  return activeMessage === null || window.confirm(activeMessage)
}

export function useUnsavedChangesWarning(enabled: boolean, message: string) {
  useEffect(() => {
    if (!enabled) return
    activeMessage = message

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ""
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      // Same page (incl. hash-only jumps) doesn't unmount the form.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!confirmLeave()) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      activeMessage = null
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [enabled, message])
}
