import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Loads data and keeps it fresh. Polling pauses while `active` is false (e.g. once an assessment is
 * completed) and while the tab is hidden.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number, active = true, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const refresh = useCallback(async () => {
    try {
      const value = await loadRef.current()
      setData(value)
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs, refresh])

  return { data, error, loading, refresh }
}
