import { useCallback, useEffect, useRef, useState } from 'react'

export interface SessionExpiryState {
  warningOpen: boolean
  remainingSeconds: number
  dismissWarning: () => void
}

interface CountdownState {
  scheduleRevision: number
  warningOpen: boolean
  remainingSeconds: number
}

export function useSessionExpiry(
  accessTokenExpiresAt: string | null,
  onExpire: (scheduledExpiry: string, scheduleRevision: number) => void,
  isLatestExpiry: (scheduledExpiry: string, scheduleRevision: number) => boolean,
  scheduleRevision: number,
): SessionExpiryState {
  const [countdown, setCountdown] = useState<CountdownState>({ scheduleRevision: -1, warningOpen: false, remainingSeconds: 0 })
  const generation = useRef(0)
  const dismissWarning = useCallback(() => {
    setCountdown((current) => ({ ...current, warningOpen: false }))
  }, [])

  useEffect(() => {
    const currentGeneration = ++generation.current
    if (!accessTokenExpiresAt) return

    const expiresAt = Date.parse(accessTokenExpiresAt)
    if (!Number.isFinite(expiresAt)) return

    let countdownTimer: ReturnType<typeof setInterval> | null = null
    const isCurrent = () => generation.current === currentGeneration && isLatestExpiry(accessTokenExpiresAt, scheduleRevision)
    const expire = () => {
      if (!isCurrent()) return
      setCountdown({ scheduleRevision, warningOpen: false, remainingSeconds: 0 })
      onExpire(accessTokenExpiresAt, scheduleRevision)
    }
    const updateCountdown = () => {
      if (!isCurrent()) return
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      if (seconds === 0) {
        expire()
        return
      }
      setCountdown({ scheduleRevision, warningOpen: true, remainingSeconds: seconds })
    }

    const remainingMs = expiresAt - Date.now()
    if (remainingMs <= 0) {
      const expiredTimer = setTimeout(expire, 0)
      return () => {
        generation.current += 1
        clearTimeout(expiredTimer)
      }
    }

    const warningTimer = setTimeout(() => {
      if (!isCurrent()) return
      updateCountdown()
      countdownTimer = setInterval(updateCountdown, 1000)
    }, Math.max(0, remainingMs - 60_000))
    const expiryTimer = setTimeout(expire, remainingMs)

    return () => {
      generation.current += 1
      clearTimeout(warningTimer)
      clearTimeout(expiryTimer)
      if (countdownTimer !== null) clearInterval(countdownTimer)
    }
  }, [accessTokenExpiresAt, isLatestExpiry, onExpire, scheduleRevision])

  const isCurrentSchedule = countdown.scheduleRevision === scheduleRevision
  return {
    warningOpen: isCurrentSchedule && countdown.warningOpen,
    remainingSeconds: isCurrentSchedule ? countdown.remainingSeconds : 0,
    dismissWarning,
  }
}
