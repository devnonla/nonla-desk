import { AppWindow, Download, Pencil, Power, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { ContextMenu } from '../ui/ContextMenu'
import { AppIcon } from './AppIcon'
import type { AppItem } from './types'

interface DesktopIconProps {
  app: AppItem
  active?: boolean
  onOpen: () => void
  onEdit: () => void
  onExport: () => void
  onToggle: () => void
  onDelete: () => void
}

const iconButtonClass =
  'group w-[96px] flex flex-col items-center gap-2 py-2 px-0 rounded-md border-none cursor-pointer select-none outline-none bg-transparent focus-visible:outline-2 focus-visible:outline-(--color-primary)'

const labelClass =
  'text-[12px] leading-[18px] font-semibold text-center line-clamp-2 w-full text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]'

function plateClass(active: boolean, extra = '') {
  return `w-11 h-11 flex items-center justify-center [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.45))] ${
    active ? 'ring-2 ring-(--color-primary) rounded-[10px]' : ''
  } ${extra}`
}

export function DesktopIcon({
  app,
  active = false,
  onOpen,
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
        title={app.name}
        aria-label={app.name}
        aria-current={active ? 'true' : undefined}
        aria-haspopup="menu"
        aria-expanded={menu ? true : undefined}
        onClick={onOpen}
        onContextMenu={handleContextMenu}
        className={iconButtonClass}
      >
        <span className={plateClass(active, app.enabled ? '' : 'opacity-45')}>
          <AppIcon name={app.icon} size={32} />
        </span>
        <span className={labelClass}>{app.name}</span>
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
          { type: 'separator', key: 's1' },
          {
            key: 'edit',
            label: 'Edit',
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

interface DesktopSystemIconProps {
  label: string
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
}

export function DesktopSystemIcon({
  label,
  icon,
  active = false,
  onClick,
}: DesktopSystemIconProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={iconButtonClass}
    >
      <span className={plateClass(active)}>{icon}</span>
      <span className={labelClass}>{label}</span>
    </button>
  )
}
