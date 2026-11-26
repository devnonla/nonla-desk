import type React from 'react'
import { useState } from 'react'
import { AppWindow, Download, ExternalLink, Pencil, Power, Trash2, X } from '@/components/ui/icons'
import { ContextMenu } from '../ui/ContextMenu'
import { AppIcon } from './AppIcon'
import type { AppItem } from './types'

interface DesktopIconProps {
  app: AppItem
  active?: boolean
  onOpen: () => void
  onInstallNative: () => void
  onRemoveNative: () => void
  onEdit: () => void
  onExport: () => void
  onToggle: () => void
  onDelete: () => void
}

export const iconButtonClass =
  'group w-24 flex flex-col items-center gap-1.5 pt-2 pb-1.5 px-1 rounded-lg border-none cursor-pointer select-none outline-none bg-transparent focus-visible:outline-2 focus-visible:outline-white/80'

/**
 * macOS desktop style: white text with a soft shadow, no selection highlight. The
 * name is at most twice the icon wide (96px): it goes to a second line when longer, and is cut with "…" after two lines.
 */
export function labelClass(muted: boolean) {
  return `w-max max-w-24 px-0.5 text-[12px] leading-4 font-medium text-center line-clamp-2 [text-shadow:0_1px_2px_rgba(0,0,0,0.65),0_0_6px_rgba(0,0,0,0.35)] ${
    muted ? 'text-white/70' : 'text-white'
  }`
}

/** SVG icons bring their own shape and background; named icons sit on a white tile. */
export function plateClass(svg: boolean) {
  const look = svg
    ? 'drop-shadow-[0_3px_6px_rgba(0,0,0,0.22)]'
    : 'rounded-[11px] bg-white border border-black/6 shadow-[0_3px_6px_rgba(0,0,0,0.18)]'
  return `relative w-12 h-12 flex items-center justify-center transition-transform duration-150 group-active:scale-95 ${look}`
}

export function DesktopIcon({
  app,
  active = false,
  onOpen,
  onInstallNative,
  onRemoveNative,
  onEdit,
  onExport,
  onToggle,
  onDelete,
}: DesktopIconProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <button
        type="button"
        title={app.standalone ? `${app.name} (native app)` : app.name}
        aria-label={app.standalone ? `${app.name}, native app` : app.name}
        data-app-id={app.id}
        aria-current={active ? 'true' : undefined}
        aria-haspopup="menu"
        aria-expanded={menu ? true : undefined}
        onClick={onOpen}
        onContextMenu={handleContextMenu}
        className={iconButtonClass}
      >
        <span className={plateClass(Boolean(app.iconSvg))}>
          <span className={app.enabled ? '' : 'opacity-45 grayscale'}>
            <AppIcon name={app.icon} svg={app.iconSvg} size={app.iconSvg ? 48 : 28} />
          </span>
          {app.standalone && (
            <span
              aria-hidden
              className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-white text-(--color-ink) shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            >
              <ExternalLink size={10} />
            </span>
          )}
        </span>
        <span className={labelClass(!app.enabled)}>{app.name}</span>
      </button>

      <ContextMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        label={`${app.name} actions`}
        onClose={() => setMenu(null)}
        items={[
          {
            key: 'open',
            label: 'Open',
            icon: <AppWindow size={14} />,
            onSelect: onOpen,
          },
          ...(app.standalone
            ? [
                {
                  key: 'remove-native',
                  label: 'Remove Native App',
                  icon: <X size={14} />,
                  onSelect: onRemoveNative,
                },
              ]
            : [
                {
                  key: 'install-native',
                  label: 'Install as Native App',
                  icon: <Download size={14} />,
                  onSelect: onInstallNative,
                },
              ]),
          { type: 'separator', key: 's1' },
          {
            key: 'details',
            label: 'Details',
            icon: <Pencil size={14} />,
            onSelect: onEdit,
          },
          {
            key: 'toggle',
            label: app.enabled ? 'Disable' : 'Enable',
            icon: <Power size={14} />,
            onSelect: onToggle,
          },
          {
            key: 'export',
            label: 'Export',
            icon: <Download size={14} />,
            onSelect: onExport,
          },
          { type: 'separator', key: 's2' },
          {
            key: 'delete',
            label: 'Delete',
            icon: <Trash2 size={14} />,
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </>
  )
}
