import { Search, Settings, Upload, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import type { AppItem } from './types'

interface DesktopCommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  apps: AppItem[]
  onOpenApp: (app: AppItem) => void
  onImportApp: () => void
  onOpenSettings: () => void
}

export function DesktopCommandPalette({
  isOpen,
  onClose,
  apps,
  onOpenApp,
  onImportApp,
  onOpenSettings,
}: DesktopCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isOpen])

  // Filter apps
  const filteredApps = useMemo(() => {
    if (!query.trim()) return apps
    const q = query.toLowerCase()
    return apps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q),
    )
  }, [apps, query])

  // System actions that match query
  const systemActions = useMemo(() => {
    const list = [
      {
        id: 'cmd-import',
        title: 'Import Mini App (.zip)',
        icon: <Upload size={14} />,
        action: onImportApp,
      },
      {
        id: 'cmd-settings',
        title: 'Open Settings',
        icon: <Settings size={14} />,
        action: onOpenSettings,
      },
    ]

    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((item) => item.title.toLowerCase().includes(q))
  }, [query, onImportApp, onOpenSettings])

  const totalItems = filteredApps.length + systemActions.length

  useEffect(() => {
    if (selectedIndex >= totalItems && totalItems > 0) {
      setSelectedIndex(totalItems - 1)
    }
  }, [totalItems, selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex < filteredApps.length) {
        const app = filteredApps[selectedIndex]
        if (app) {
          onClose()
          onOpenApp(app)
        }
      } else {
        const actionIdx = selectedIndex - filteredApps.length
        const action = systemActions[actionIdx]
        if (action) {
          onClose()
          action.action()
        }
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spotlight search"
      className="fixed inset-0 z-50 bg-[rgba(29,29,29,0.18)] flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-md border border-(--color-hairline) bg-(--color-canvas-soft) shadow-[0_16px_48px_rgba(29,29,29,0.12),0_0_0_1px_rgba(29,29,29,0.06)] overflow-hidden flex flex-col font-sans"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-3.5 py-3 border-b border-(--color-hairline) bg-(--color-canvas) gap-2.5">
          <Search size={16} className="text-(--color-mute) shrink-0" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search mini apps, commands, actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-(--color-ink-strong) placeholder:text-(--color-mute)"
          />
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-xs border-none bg-transparent text-(--color-mute) hover:text-(--color-ink) cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-(--color-hairline)/30">
          {/* Apps Section */}
          {filteredApps.length > 0 && (
            <div className="pb-2">
              <div className="px-2 py-1 text-[10px] font-semibold text-(--color-mute) font-mono uppercase tracking-wider">
                Mini Apps
              </div>
              {filteredApps.map((app, index) => {
                const isSelected = index === selectedIndex
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenApp(app)
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xs text-left cursor-pointer border-none transition-colors ${
                      isSelected
                        ? 'bg-(--color-canvas) text-(--color-ink-strong) ring-1 ring-(--color-primary)/50'
                        : 'bg-transparent text-(--color-ink) hover:bg-(--color-canvas)'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xs border flex items-center justify-center shrink-0 ${
                        app.enabled
                          ? 'border-(--color-primary)/40 bg-(--color-canvas-soft) text-(--color-primary)'
                          : 'border-(--color-hairline) bg-(--color-canvas) text-(--color-mute)'
                      }`}
                    >
                      <AppIcon name={app.icon} size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{app.name}</div>
                      {app.description && (
                        <div className="text-[11px] text-(--color-mute) truncate">
                          {app.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-(--color-mute)">
                        v{app.version}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.2 rounded-(--radius-pill) border ${
                          app.enabled
                            ? 'border-(--color-primary)/40 text-(--color-primary) bg-(--color-primary)/10'
                            : 'border-(--color-hairline) text-(--color-mute)'
                        }`}
                      >
                        {app.enabled ? 'On' : 'Off'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* System Actions Section */}
          {systemActions.length > 0 && (
            <div className="pt-2">
              <div className="px-2 py-1 text-[10px] font-semibold text-(--color-mute) font-mono uppercase tracking-wider">
                Commands & Actions
              </div>
              {systemActions.map((item, actIndex) => {
                const totalIndex = filteredApps.length + actIndex
                const isSelected = totalIndex === selectedIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onClose()
                      item.action()
                    }}
                    onMouseEnter={() => setSelectedIndex(totalIndex)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xs text-left cursor-pointer border-none transition-colors ${
                      isSelected
                        ? 'bg-(--color-canvas) text-(--color-ink-strong) ring-1 ring-(--color-primary)/50'
                        : 'bg-transparent text-(--color-ink) hover:bg-(--color-canvas)'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-xs border border-(--color-hairline) bg-(--color-canvas-soft) flex items-center justify-center shrink-0 text-(--color-mute)">
                      {item.icon}
                    </div>
                    <span className="text-[13px] font-medium flex-1">{item.title}</span>
                    <span className="font-mono text-[10px] text-(--color-mute)">Action</span>
                  </button>
                )
              })}
            </div>
          )}

          {totalItems === 0 && (
            <div className="py-10 text-center text-[13px] text-(--color-mute)">
              No results for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-3.5 py-2 border-t border-(--color-hairline) bg-(--color-canvas) flex items-center justify-between text-[11px] text-(--color-mute) font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span>Nonla Desktop OS</span>
        </div>
      </div>
    </div>
  )
}
