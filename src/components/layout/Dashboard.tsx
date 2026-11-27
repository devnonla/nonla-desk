import type React from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import desktopBackground from '@/assets/desktop-bg.jpg'
import { api } from '@/lib/api'
import { queueZip } from '@/lib/import-queue'
import { useWindows } from '../../hooks/useWindows'
import { AboutIcon } from '../desktop/AboutIcon'
import { DesktopClock } from '../desktop/DesktopClock'
import { DesktopCommandPalette } from '../desktop/DesktopCommandPalette'
import { DesktopIcon } from '../desktop/DesktopIcon'
import { ImportIcon } from '../desktop/ImportIcon'
import { TopBar } from '../desktop/TopBar'
import type { AppItem } from '../desktop/types'
import { confirm } from '../ui/ConfirmDialog'
import { toast } from '../ui/Toast'

// Only shown on an empty desktop; it pulls in the code block highlighter.
const CliOnboarding = lazy(() =>
  import('../desktop/CliOnboarding').then((m) => ({ default: m.CliOnboarding })),
)

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return false
}

interface DashboardProps {
  /** Mini apps, loaded once by App and refreshed on every change event. */
  apps: AppItem[]
  loading: boolean
  loadApps: () => void
}

export default function Dashboard({ apps, loading, loadApps }: DashboardProps) {
  const { windows, focused, open, closeApp } = useWindows()
  const [dragOver, setDragOver] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  // The app of the top-most window is the "selected" desktop icon.
  const activeMiniId = focused?.appId ?? null
  const noOpenWindows = windows.length === 0

  const openApp = (app: AppItem) => {
    if (app.enabled && app.standalone) {
      void api.openStandalone(app.id).then((r) => {
        if (!r.success) toast.error(r.error)
      })
      return
    }
    open(app.enabled ? 'app' : 'info', app.id)
  }

  const handleInstallNative = async (app: AppItem) => {
    toast.info(`Adding "${app.name}" to Applications…`)
    const r = await api.installStandalone(app.id)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    loadApps()
    toast.success(`"${app.name}" is now a native app`)
    if (app.enabled) await api.openStandalone(app.id)
  }

  const handleRemoveNative = async (app: AppItem) => {
    const r = await api.uninstallStandalone(app.id)
    if (r.success) {
      loadApps()
      toast.success(`Removed native app "${app.name}"`)
    } else toast.error(r.error)
  }

  const handleDelete = (id: string, name: string) => {
    confirm({
      title: `Delete "${name}"?`,
      content: 'This will permanently remove the mini app and all its stored data.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.deleteMiniApp(id)
          toast.success(`Deleted "${name}"`)
          closeApp(id)
          loadApps()
        } catch {
          toast.error('Failed to delete mini app')
        }
      },
    })
  }

  const handleToggle = async (id: string) => {
    try {
      const result = await api.toggleMiniApp(id)
      if (result?.missingConfigs && result.missingConfigs.length > 0) {
        toast.warning(
          `Please fill in required config before enabling: ${result.missingConfigs.join(', ')}`,
        )
        open('info', id)
        return
      }
      if (result?.success) {
        toast.success(result.enabled ? 'App enabled' : 'App disabled')
        loadApps()
      }
    } catch {
      toast.error('Failed to toggle mini app')
    }
  }

  const handleExport = async (id: string) => {
    try {
      const result = await api.exportMiniApp(id)
      if (!result.success) toast.error(result.error)
      else if (result.path) toast.success(`Exported to ${result.path}`)
    } catch {
      toast.error('Failed to export mini app')
    }
  }

  // A zip dropped on the desktop goes to the Import window, which checks it first.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    queueZip(file)
    open('import')
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen(true)
        return
      }

      if (isEditableTarget(e.target)) return

      if (e.key === '/' && !isCommandPaletteOpen) {
        e.preventDefault()
        setIsCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCommandPaletteOpen])

  const renderAppIcon = (app: AppItem) => (
    <DesktopIcon
      key={app.id}
      app={app}
      active={activeMiniId === app.id}
      onOpen={() => openApp(app)}
      onInstallNative={() => handleInstallNative(app)}
      onRemoveNative={() => handleRemoveNative(app)}
      onEdit={() => open('info', app.id)}
      onExport={() => handleExport(app.id)}
      onToggle={() => handleToggle(app.id)}
      onDelete={() => handleDelete(app.id, app.name)}
    />
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={handleDrop}
      className="absolute inset-0 overflow-hidden bg-[#f6c28b]"
    >
      {/* Same artwork as the open-agent-hands sign-in screen. */}
      <img
        src={desktopBackground}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-cover object-center pointer-events-none select-none"
      />
      {dragOver ? (
        <div
          aria-hidden="true"
          className="absolute inset-2 top-13 z-30 rounded-xl border-2 border-dashed border-(--color-primary) bg-(--color-primary-glow) pointer-events-none"
        />
      ) : null}

      {/* Always on the desktop, behind windows: closing a window never makes it pop in. */}
      {apps.length > 0 ? <DesktopClock /> : null}

      <TopBar />

      {/* Icons fill columns top to bottom, then wrap to the right. */}
      <nav
        aria-label="Mini apps"
        className="absolute inset-x-0 top-11 bottom-0 z-20 px-5 py-4 flex flex-col flex-wrap content-start items-start gap-x-1 gap-y-3 overflow-x-auto"
      >
        <AboutIcon active={windows.some((w) => w.kind === 'about')} onOpen={() => open('about')} />
        <ImportIcon
          active={windows.some((w) => w.kind === 'import')}
          onOpen={() => open('import')}
        />
        {loading ? <span className="sr-only">Loading apps…</span> : apps.map(renderAppIcon)}
      </nav>

      <DesktopCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        apps={apps}
        onOpenApp={openApp}
        onImportApp={() => open('import')}
      />

      {!loading && apps.length === 0 && noOpenWindows && (
        <Suspense fallback={null}>
          <CliOnboarding />
        </Suspense>
      )}
    </div>
  )
}
