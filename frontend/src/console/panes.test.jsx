import { fireEvent, render, renderHook, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Splitter from './Splitter'
import { usePaneWidth } from './usePaneWidth'
import { reloadOnStaleChunk, clearStaleChunkFlag } from './chunkRecovery'

describe('a persisted pane width', () => {
  const KEY = 'pt.test.width'

  it('clamps a stored width that is outside the current bounds', () => {
    // Bounds change between releases. A width persisted under the old ones
    // must not restore a pane wider than the screen it opens on.
    localStorage.setItem(KEY, '9999')
    const { result } = renderHook(() => usePaneWidth(KEY, 460, 360, 760))
    expect(result.current[0]).toBe(760)
  })

  it('clamps on the way out as well as the way in', () => {
    const { result } = renderHook(() => usePaneWidth(KEY, 460, 360, 760))
    act(() => result.current[1](10))
    expect(result.current[0]).toBe(360)
    act(() => result.current[1](5000))
    expect(result.current[0]).toBe(760)
    expect(Number(localStorage.getItem(KEY))).toBe(760)
  })

  it('falls back to the default when the store holds nonsense', () => {
    localStorage.setItem(KEY, 'not a number')
    const { result } = renderHook(() => usePaneWidth(KEY, 460, 360, 760))
    expect(result.current[0]).toBe(460)
  })

  it('renders when storage throws instead of taking the console down', () => {
    // A private window can throw on any access. Signing in again is a fine
    // worst case; a blank screen is not.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const { result } = renderHook(() => usePaneWidth(KEY, 460, 360, 760))
    expect(result.current[0]).toBe(460)
  })
})

describe('the resize handle', () => {
  const setup = (onChange) => {
    render(<Splitter value={400} min={360} max={760} side="right"
                     label="Patient record width" onChange={onChange} />)
    return screen.getByRole('separator', { name: /patient record width/i })
  }

  it('publishes its position to assistive technology', () => {
    const handle = setup(vi.fn())
    expect(handle).toHaveAttribute('aria-valuenow', '400')
    expect(handle).toHaveAttribute('aria-valuemin', '360')
    expect(handle).toHaveAttribute('aria-valuemax', '760')
  })

  it('moves the separator the way the arrow points', async () => {
    // A workstation nurse should not need a mouse to widen a patient record,
    // and the keyboard must walk the handle the same way a drag does. This
    // drawer is pinned right, so moving the handle left widens it.
    const onChange = vi.fn()
    const handle = setup(onChange)
    handle.focus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith(416)

    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(384)

    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith(360)
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith(760)
  })

  it('ignores a right-click', () => {
    // A context menu is not a drag. Starting one on button 2 left the handle
    // stuck to the pointer with no button held to end it.
    const onChange = vi.fn()
    const handle = setup(onChange)
    fireEvent.pointerDown(handle, { button: 2, clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('recovering from a stale chunk', () => {
  const reload = vi.fn()

  beforeEach(() => {
    clearStaleChunkFlag()
    vi.stubGlobal('location', { ...window.location, reload })
    reload.mockClear()
  })

  it('reloads once and then gives up to the boundary', () => {
    // Reloading picks up the new build after a deploy. Reloading again on a
    // failure that is not a stale chunk would trap the user in a loop.
    reloadOnStaleChunk(new Error('failed to fetch dynamically imported module'))
    expect(reload).toHaveBeenCalledTimes(1)

    expect(() => reloadOnStaleChunk(new Error('still broken'))).toThrow('still broken')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('throws rather than reloading when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => reloadOnStaleChunk(new Error('boom'))).toThrow('boom')
    expect(reload).not.toHaveBeenCalled()
  })
})
