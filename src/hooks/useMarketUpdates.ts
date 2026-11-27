import { useCallback, useEffect, useState } from 'react'
import { api, type MarketApp, type Marketplace, type MarketUpdate } from '@/lib/api'

/**
 * Added marketplaces, their apps, and the installed ones that have a newer
 * version. Re-read when apps change or the marketplaces are refreshed;
 * `check()` fetches the marketplaces now.
 */
export function useMarketUpdates() {
  const [markets, setMarkets] = useState<Marketplace[]>([])
  const [updates, setUpdates] = useState<MarketUpdate[]>([])
  const [apps, setApps] = useState<MarketApp[]>([])
  const [checking, setChecking] = useState(false)

  const load = useCallback(async (refresh = false) => {
    try {
      const r = await api.marketOutdated(refresh)
      setMarkets(r.markets)
      setUpdates(r.apps)
      setApps(r.markets.length ? await api.marketApps() : [])
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

  return { markets, updates, apps, checking, check, reload: load }
}
