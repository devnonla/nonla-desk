import { useEffect, useState } from 'react'
import { useMarketUpdates } from '@/hooks/useMarketUpdates'
import { api } from '@/lib/api'
import AppLogo from '../ui/AppLogo'
import { iconButtonClass, labelClass, plateClass } from './DesktopIcon'

interface AboutIconProps {
  active?: boolean
  onOpen: () => void
}

/** The first desktop icon: opens the Nonla Desk page. A red dot means an update of Nonla Desk or of a mini app. */
export function AboutIcon({ active = false, onOpen }: AboutIconProps) {
  const [pending, setPending] = useState<string | null>(null)
  const { updates } = useMarketUpdates()

  useEffect(() => {
    void api.getUpdateInfo().then((info) => setPending(info.pending))
    return api.onUpdatePending(setPending)
  }, [])

  const notes = [
    pending && `update ${pending} available`,
    updates.length > 0 &&
      `${updates.length} mini app update${updates.length > 1 ? 's' : ''} available`,
  ].filter(Boolean)
  const label = notes.length ? `Nonla Desk (${notes.join(', ')})` : 'Nonla Desk'

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-app-id="nonla-about"
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      className={iconButtonClass}
    >
      <span className={plateClass(true)}>
        <AppLogo size={48} />
        {notes.length > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-red-500 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          />
        )}
      </span>
      <span className={labelClass(false)}>Nonla Desk</span>
    </button>
  )
}
