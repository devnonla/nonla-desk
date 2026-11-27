import { AppIcon } from './AppIcon'
import { iconButtonClass, labelClass, plateClass } from './DesktopIcon'

/** A package with a green plus on a blue tile (install), in the same style as mini app icons. */
export const IMPORT_ICON_SVG =
  '<svg viewBox="0 0 48 48"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c9bff"/><stop offset="1" stop-color="#4a5fe0"/></linearGradient><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#bg)"/><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#hl)"/><path d="M24 10.5 36 16.5 24 22.5 12 16.5Z" fill="#fff"/><path d="M12 16.5 24 22.5V36L12 30Z" fill="#fff" fill-opacity=".78"/><path d="M36 16.5 24 22.5V36L36 30Z" fill="#fff" fill-opacity=".55"/><path d="M18 13.5 30 19.5V24" fill="none" stroke="#4a5fe0" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="33.5" r="7" fill="#22c55e" stroke="#fff" stroke-width="2"/><path d="M35 30v7M31.5 33.5h7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>'

interface ImportIconProps {
  active?: boolean
  onOpen: () => void
}

/** Second desktop icon: install a mini app from a zip or a marketplace. */
export function ImportIcon({ active = false, onOpen }: ImportIconProps) {
  return (
    <button
      type="button"
      title="Import a mini app"
      aria-label="Import a mini app"
      data-app-id="nonla-import"
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      className={iconButtonClass}
    >
      <span className={plateClass(true)}>
        <AppIcon name="📥" svg={IMPORT_ICON_SVG} size={48} />
      </span>
      <span className={labelClass(false)}>Import</span>
    </button>
  )
}
