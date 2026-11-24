import { type CommandGroup, CommandPalette } from 'devnonla-ui'
import { useMemo } from 'react'
import { Upload } from '@/components/ui/icons'
import { AppIcon } from './AppIcon'
import type { AppItem } from './types'

interface DesktopCommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  apps: AppItem[]
  onOpenApp: (app: AppItem) => void
  onImportApp: () => void
}

/** ⌘K / "/" search over mini apps and desktop actions. Dashboard owns the hotkeys. */
export function DesktopCommandPalette({
  isOpen,
  onClose,
  apps,
  onOpenApp,
  onImportApp,
}: DesktopCommandPaletteProps) {
  const groups = useMemo<CommandGroup[]>(
    () => [
      {
        label: 'Apps',
        items: apps.map((app) => ({
          key: app.id,
          label: app.name,
          description: app.enabled ? app.description : 'Disabled',
          icon: <AppIcon name={app.icon} svg={app.iconSvg} size={18} />,
          disabled: !app.enabled,
          onSelect: () => onOpenApp(app),
        })),
      },
      {
        label: 'Actions',
        items: [
          {
            key: 'import',
            label: 'Import mini app (.zip)',
            icon: <Upload size={16} />,
            onSelect: onImportApp,
          },
        ],
      },
    ],
    [apps, onOpenApp, onImportApp],
  )

  return (
    <CommandPalette
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      hotkey={false}
      placeholder="Search apps and actions…"
      emptyText="No apps or actions match"
      groups={groups}
    />
  )
}
