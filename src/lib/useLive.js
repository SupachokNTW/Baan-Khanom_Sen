import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

let channelSeq = 0

// Fetch data and keep it fresh: Supabase Realtime on `tables`, plus polling as a fallback
// (Realtime can silently drop on flaky phone networks / LINE's in-app browser).
export function useLive(tables, fetcher, { interval = 20000, enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const running = useRef(false)
  const again = useRef(false)

  const refresh = useCallback(async () => {
    if (running.current) { again.current = true; return }
    running.current = true
    try {
      do {
        again.current = false
        const next = await fetcherRef.current()
        setData(next)
        setError(null)
      } while (again.current)
    } catch (e) {
      setError(e)
    } finally {
      running.current = false
      setLoading(false)
    }
  }, [])

  const key = tables.join(',')
  useEffect(() => {
    if (!enabled) return
    refresh()
    let timer
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 250) }
    const channel = supabase.channel(`live-${key}-${++channelSeq}`)
    for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon)
    channel.subscribe()
    const poll = setInterval(refresh, interval)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, interval, enabled, refresh])

  return { data, error, loading, refresh, setData }
}
