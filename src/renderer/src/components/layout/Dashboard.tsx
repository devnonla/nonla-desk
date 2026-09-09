import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import meadowWallpaper from '@/assets/desktop-meadow.jpg'
import { useMiniAppChanges } from '../../hooks/useMiniAppChanges'
import { AppIcon } from '../desktop/AppIcon'
import { DesktopCommandPalette } from '../desktop/DesktopCommandPalette'
import { DesktopIcon, DesktopSystemIcon } from '../desktop/DesktopIcon'
import { McpOnboarding } from '../desktop/McpOnboarding'
import type { AppItem } from '../desktop/types'
import { confirm } from '../ui/ConfirmDialog'
import { toast } from '../ui/Toast'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(target.closest('.monaco-editor'))
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [apps, setApps] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  const loadApps = useCallback(async () => {
    try {
      const list = await window.api?.listMiniApps()
      setApps(list || [])
    } catch {
      toast.error('Failed to load apps')
      setApps([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (location.pathname) loadApps()
  }, [loadApps, location.pathname])

  useMiniAppChanges(() => {
    void loadApps()
  })

  const activeMiniId = location.pathname.startsWith('/mini/')
    ? location.pathname.replace('/mini/', '')
    : location.pathname.startsWith('/mini-apps/edit/')
      ? location.pathname.replace('/mini-apps/edit/', '')
      : null

  const openApp = (app: AppItem) => {
    if (app.enabled) navigate(`/mini/${app.id}`)
    else navigate(`/mini-apps/edit/${app.id}`)
  }

  const handleDelete = (id: string, name: string) => {
    confirm({
      title: `Delete "${name}"?`,
      content: 'This will permanently remove the mini app and all its stored data.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await window.api?.deleteMiniApp(id)
          toast.success(`Deleted "${name}"`)
          if (location.pathname.includes(id)) navigate('/')
          loadApps()
        } catch {
          toast.error('Failed to delete mini app')
        }
      },
    })
  }

  const handleToggle = async (id: string) => {
    try {
      const result = await window.api?.toggleMiniApp(id)
      if (result?.missingConfigs && result.missingConfigs.length > 0) {
        toast.warning(
          `Please fill in required config before enabling: ${result.missingConfigs.join(', ')}`,
        )
        navigate(`/mini-apps/edit/${id}`)
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
      const result = await window.api?.exportMiniApp(id)
      if (result?.success && result.data) {
        const blob = new Blob([result.data], { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const app = apps.find((item) => item.id === id)
        const slug = (app?.name || 'miniapp').toLowerCase().replace(/\s+/g, '-')
        a.download = `${slug}.miniapp.zip`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Exported as ZIP')
      }
    } catch {
      toast.error('Failed to export mini app')
    }
  }

  const importZipFile = async (file: File) => {
    try {
      if (!file.name.endsWith('.zip')) {
        toast.error('Please select a .miniapp.zip file')
        return
      }

      const buffer = await file.arrayBuffer()
      const result = await window.api?.importMiniAppZip(buffer)
      if (result?.success) {
        toast.success(
          result.updated ? `Updated "${file.name}" (existing app)` : `Imported "${file.name}"`,
        )
        loadApps()
      } else {
        toast.error(result?.error || 'Import failed')
      }
    } catch {
      toast.error('Failed to import mini app')
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await importZipFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await importZipFile(file)
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
      onEdit={() => navigate(`/mini-apps/edit/${app.id}`)}
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
      className={`absolute inset-0 bg-[#4f7a32] ${
        dragOver ? 'ring-2 ring-inset ring-(--color-primary)' : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.miniapp.zip"
        className="hidden"
        onChange={handleFileSelect}
      />

      <img
        src={meadowWallpaper}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-cover object-center pointer-events-none select-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(20,30,10,0.28)_0%,transparent_124px,transparent_calc(100%-124px),rgba(20,30,10,0.28)_100%)]"
      />

      {/* Left icon column */}
      <nav
        aria-label="Mini apps"
        className="absolute left-0 top-0 bottom-0 z-20 w-27 overflow-y-auto py-4 flex flex-col items-center gap-2"
      >
        {loading ? (
          <span className="sr-only">Loading apps…</span>
        ) : apps.length === 0 ? (
          <p className="px-2 text-[12px] leading-4 text-center text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            No apps yet
          </p>
        ) : (
          apps.map(renderAppIcon)
        )}
      </nav>

      {/* Right icon column */}
      <nav
        aria-label="System"
        className="absolute right-0 top-0 bottom-0 z-20 w-27 overflow-y-auto py-4 flex flex-col items-center gap-2"
      >
        <DesktopSystemIcon
          label="Import"
          icon={<AppIcon name="Upload" size={32} />}
          onClick={() => fileInputRef.current?.click()}
        />
        <DesktopSystemIcon
          label="Search"
          icon={<AppIcon name="Search" size={32} />}
          onClick={() => setIsCommandPaletteOpen(true)}
        />
        <DesktopSystemIcon
          label="Settings"
          icon={<AppIcon name="Settings" size={32} />}
          active={location.pathname === '/settings'}
          onClick={() => navigate(location.pathname === '/settings' ? '/' : '/settings')}
        />
      </nav>

      <DesktopCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        apps={apps}
        onOpenApp={openApp}
        onImportApp={() => fileInputRef.current?.click()}
        onOpenSettings={() => navigate('/settings')}
      />

      {!loading && apps.length === 0 && location.pathname === '/' && (
        <McpOnboarding onConnect={() => navigate('/settings')} />
      )}
    </div>
  )
}
