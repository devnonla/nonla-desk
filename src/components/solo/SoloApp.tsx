import { useEffect, useState } from 'react'
import MiniAppRenderer from '@/components/tools/MiniAppRenderer'
import { api } from '@/lib/api'

/** The whole window of a mini app installed as its own macOS app. */
export default function SoloApp() {
  const [appId, setAppId] = useState<string | null>(null)

  useEffect(() => {
    void api.soloAppId().then(setAppId)
  }, [])

  if (!appId) return null
  return (
    <div className="h-full overflow-hidden bg-white">
      <MiniAppRenderer appId={appId} />
    </div>
  )
}
