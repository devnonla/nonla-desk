import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import AppLogo from '../ui/AppLogo'
import { iconButtonClass, labelClass, plateClass } from './DesktopIcon'

interface AboutIconProps {
  active?: boolean
  onOpen: () => void
}

/** The first desktop icon: opens the Nonla Desk page (about, version, updates, how to build apps). */
export function AboutIcon({ active = false, onOpen }: AboutIconProps) {
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    void api.getUpdateInfo().then((info) => setPending(info.pending))
    return api.onUpdatePending(setPending)
  }, [])

  return (
    <button
      type="button"
      title={pending ? `Nonla Desk (update ${pending} available)` : 'Nonla Desk'}
      aria-label={pending ? `Nonla Desk, update ${pending} available` : 'Nonla Desk'}
      data-app-id="nonla-about"
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      className={iconButtonClass}
    >
      <span className={plateClass(true)}>
        <AppLogo size={48} />
        {pending && (
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
