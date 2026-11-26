import { useCallback, useEffect, useState } from 'react'
import { api, type MarketUpdate } from '@/lib/api'

/**
 * Installed marketplace apps that have a newer version. Re-read when apps
 * change or the marketplaces are refreshed; `check()` fetches them now.
 */
export function useMarketUpdates() {
  const [markets, setMarkets] = useState(0)
  const [updates, setUpdates] = useState<MarketUpdate[]>([])
  const [checking, setChecking] = useState(false)

  const load = useCallback(async (refresh = false) => {
    try {
      const r = await api.marketOutdated(refresh)
      setMarkets(r.markets)
      setUpdates(r.apps)
    } catch {
      // No marketplace folder or git trouble: show nothing rather than an error.
    }
  }, [])

  useEffect(() => {
    void load()
    const offChanged = api.onMiniAppChanged(() => void load())
    const offChecked = api.onMarketChecked(() => void load())
    return () => {
      offChanged()
      offChecked()
    }
  }, [load])

  const check = useCallback(async () => {
    setChecking(true)
    try {
      await load(true)
    } finally {
      setChecking(false)
    }
  }, [load])

  return { markets, updates, checking, check }
}
