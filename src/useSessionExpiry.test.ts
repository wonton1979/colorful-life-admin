import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionExpiry } from './useSessionExpiry'

describe('useSessionExpiry', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')
  let currentExpiry: string | null
  let currentRevision: number

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const renderExpiry = (expiresAt: string, onExpire = vi.fn()) => {
    currentExpiry = expiresAt
    currentRevision = 0
    const isLatestExpiry = (value: string, revision: number) => value === currentExpiry && revision === currentRevision
    return renderHook(() => useSessionExpiry(expiresAt, onExpire, isLatestExpiry, currentRevision))
  }

  it('waits until access-token expiry minus 60 seconds before showing the warning', () => {
    const expiresAt = new Date(now.getTime() + 120_000).toISOString()
    const { result } = renderExpiry(expiresAt)
    expect(result.current.warningOpen).toBe(false)

    act(() => vi.advanceTimersByTime(59_999))
    expect(result.current.warningOpen).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.warningOpen).toBe(true)
    expect(result.current.remainingSeconds).toBe(60)
  })

  it('shows the remaining time immediately when less than 60 seconds remain and counts down', () => {
    const expiresAt = new Date(now.getTime() + 12_000).toISOString()
    const { result } = renderExpiry(expiresAt)
    act(() => vi.advanceTimersByTime(0))
    expect(result.current.warningOpen).toBe(true)
    expect(result.current.remainingSeconds).toBe(12)
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.remainingSeconds).toBe(9)
  })

  it('expires an already expired access token without opening a grace-period warning', () => {
    const onExpire = vi.fn()
    const expiresAt = new Date(now.getTime() - 1).toISOString()
    const { result } = renderExpiry(expiresAt, onExpire)
    act(() => vi.advanceTimersByTime(0))
    expect(result.current.warningOpen).toBe(false)
    expect(onExpire).toHaveBeenCalledOnce()
    expect(onExpire).toHaveBeenCalledWith(expiresAt, 0)
  })

  it('cancels old warning and countdown timers when renewed expiry changes or the hook unmounts', () => {
    const firstExpiry = new Date(now.getTime() + 61_000).toISOString()
    const secondExpiry = new Date(now.getTime() + 10 * 60_000).toISOString()
    const onExpire = vi.fn()
    currentExpiry = firstExpiry
    currentRevision = 1
    const isLatestExpiry = (value: string, revision: number) => value === currentExpiry && revision === currentRevision
    const { result, rerender, unmount } = renderHook(({ expiresAt, revision }) => useSessionExpiry(expiresAt, onExpire, isLatestExpiry, revision), {
      initialProps: { expiresAt: firstExpiry, revision: currentRevision },
    })

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.warningOpen).toBe(true)
    currentExpiry = secondExpiry
    currentRevision = 2
    rerender({ expiresAt: secondExpiry, revision: currentRevision })
    act(() => vi.advanceTimersByTime(60_000))
    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.warningOpen).toBe(false)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
