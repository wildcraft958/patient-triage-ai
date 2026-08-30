import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
  'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Everything a dialog owes a keyboard: Escape closes it, focus starts inside
// it, Tab cannot walk out into the board behind the scrim, and focus returns
// to whatever opened it. Without the trap a nurse tabs into controls she
// cannot see and acts on the wrong patient.
export function useDialog(onClose) {
  const ref = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current
    const firstFocusable = node?.querySelector(FOCUSABLE)
    if (firstFocusable) firstFocusable.focus()
    else node?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll(FOCUSABLE)]
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [onClose])

  return ref
}
