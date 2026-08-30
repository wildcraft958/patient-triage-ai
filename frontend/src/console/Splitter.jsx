import { useCallback, useEffect, useRef } from 'react'

// A drag handle between two panes. Pointer events rather than mouse events so
// it works under touch and pen, and arrow keys move it too: a nurse on a
// workstation should not need a mouse to widen a patient record.
export default function Splitter({ value, min, max, onChange, label,
                                   side = 'right', className = '' }) {
  const dragging = useRef(false)
  const start = useRef({ x: 0, value: 0 })

  // side tells us which way the pane grows: a rail on the left grows with the
  // pointer, a drawer pinned right grows against it
  const sign = side === 'right' ? -1 : 1

  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    dragging.current = true
    start.current = { x: e.clientX, value }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const onPointerMove = (e) => {
    if (!dragging.current) return
    onChange(clamp(start.current.value + (e.clientX - start.current.x) * sign))
  }

  const stop = useCallback((e) => {
    if (!dragging.current) return
    dragging.current = false
    e.currentTarget?.releasePointerCapture?.(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  // a drag that ends outside the window still has to release the cursor
  useEffect(() => () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16
    // The arrow moves the separator, not the number: on a right-pinned pane
    // that grows against the pointer, moving the handle left makes the pane
    // wider. Without the sign the keyboard walks it the opposite way to the
    // drag, which is the same handle disagreeing with itself.
    const moves = {
      ArrowLeft: -step * sign, ArrowRight: step * sign,
      Home: min - value, End: max - value,
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    onChange(clamp(value + moves[e.key]))
  }

  return (
    <div role="separator" aria-orientation="vertical" aria-label={label}
         aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max}
         tabIndex={0}
         onPointerDown={onPointerDown} onPointerMove={onPointerMove}
         onPointerUp={stop} onPointerCancel={stop} onKeyDown={onKeyDown}
         className={`group relative w-1 shrink-0 cursor-col-resize touch-none
                     bg-line hover:bg-brand focus-visible:bg-brand
                     focus-visible:outline-none transition-colors ${className}`}>
      {/* the visible line is 4px; the grab target is 11px, which is the
          difference between a handle people can use and one they swear at */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden="true" />
    </div>
  )
}
