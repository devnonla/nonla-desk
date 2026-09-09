import Editor, { type BeforeMount } from '@monaco-editor/react'
import { ArrowLeft, ChevronDown, Code, Eye, Save, Settings, Terminal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMiniAppChanges } from '../../hooks/useMiniAppChanges'
import { ICON_CATALOG } from '../desktop/AppIcon'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { InputNumber } from '../ui/InputNumber'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { toast } from '../ui/Toast'
import MiniAppRenderer from './MiniAppRenderer'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MiniAppDetail {
  id: string
  name: string
  description: string
  icon: string
  category: string
  version: string
  backendCode: string
  frontendCode: string
  panelCode: string | null
  enabled: boolean
}

type CodeTab = 'frontend' | 'backend' | 'panel' | 'preview'

interface LogEntry {
  id: string
  appName: string
  timestamp: number
  message: string
}

// ─── Monaco Editor Theme ─────────────────────────────────────────────────────

const MONACO_OPTIONS = {
  fontSize: 13,
  fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontLigatures: false,
  minimap: { enabled: false },
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line' as const,
  padding: { top: 12, bottom: 12 },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  wordWrap: 'off' as const,
  tabSize: 2,
  automaticLayout: true,
  stickyScroll: { enabled: false },
}

// Enable JSX support in Monaco's JavaScript mode
const handleEditorBeforeMount: BeforeMount = (monaco) => {
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    jsxFactory: '__jsx',
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    allowJs: true,
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MiniAppEditor() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const isCreating = !appId

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIcon, setFormIcon] = useState('Box')
  const [formVersion, setFormVersion] = useState('1.0.0')
  const [formBackendCode, setFormBackendCode] = useState('')
  const [formFrontendCode, setFormFrontendCode] = useState('')
  const [formPanelCode, setFormPanelCode] = useState('')
  const [activeTab, setActiveTab] = useState<CodeTab>('frontend')
  const [loading, setLoading] = useState(!isCreating)
  const [saving, setSaving] = useState(false)

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Preview key (increment to force re-render preview)
  const [previewKey, setPreviewKey] = useState(0)

  // Config
  const [configSchema, setConfigSchema] = useState<Record<string, any> | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, any>>({})

  // Load existing app
  const loadApp = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!appId) return
      if (!opts?.silent) setLoading(true)
      try {
        const app: MiniAppDetail | null = await window.api?.getMiniApp(appId)
        if (!app) {
          toast.error('Mini app not found')
          navigate('/')
          return
        }
        setFormName(app.name)
        setFormDescription(app.description)
        setFormIcon(app.icon)
        setFormVersion(app.version)
        setFormBackendCode(app.backendCode || '')
        setFormFrontendCode(app.frontendCode || '')
        setFormPanelCode(app.panelCode || '')

        try {
          const configResult = await window.api?.getMiniAppConfig(appId)
          if (configResult?.success && configResult.schema) {
            setConfigSchema(configResult.schema)
            setConfigValues(configResult.values || {})
          }
        } catch {
          // no config
        }
      } catch {
        toast.error('Failed to load mini app')
        navigate('/')
      }
      setLoading(false)
    },
    [appId, navigate],
  )

  useEffect(() => {
    loadApp()
  }, [loadApp])

  useMiniAppChanges((event) => {
    if (!appId || event.id !== appId || event.action === 'deleted') return
    if (event.codeChanged || event.metadataChanged) {
      void loadApp({ silent: true })
    }
    if (event.codeChanged) setPreviewKey((k) => k + 1)
  })

  // ─── Log Listener ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appId) return
    const cleanup = window.api?.onMiniAppLog(
      (msg: { appId: string; appName: string; timestamp: number; args: string[] }) => {
        if (msg.appId === appId) {
          setLogs((prev) => [
            ...prev.slice(-200), // keep last 200 logs
            {
              id: `log-${msg.timestamp}-${Math.random()}`,
              appName: msg.appName,
              timestamp: msg.timestamp,
              message: msg.args.join(' '),
            },
          ])
        }
      },
    )
    return () => cleanup?.()
  }, [appId])

  // Auto-scroll logs
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.warning('App name is required')
      return
    }

    setSaving(true)
    try {
      if (isCreating) {
        const result = await window.api?.createMiniApp({
          name: formName.trim(),
          description: formDescription.trim(),
          icon: formIcon,
          version: formVersion,
          backendCode: formBackendCode,
          frontendCode: formFrontendCode,
          panelCode: formPanelCode || null,
        })
        if (result?.success) {
          toast.success(`Created "${formName.trim()}"`)
          navigate('/')
        } else {
          toast.error(result?.error || 'Failed to create mini app')
        }
      } else if (appId) {
        const result = await window.api?.updateMiniApp(appId, {
          name: formName.trim(),
          description: formDescription.trim(),
          icon: formIcon,
          version: formVersion,
          backendCode: formBackendCode,
          frontendCode: formFrontendCode,
          panelCode: formPanelCode || null,
        })
        if (!result?.success) {
          toast.error(result?.error || 'Failed to update mini app')
        } else {
          if (configSchema) {
            for (const [key, value] of Object.entries(configValues)) {
              await window.api?.setMiniAppConfig(appId, key, value)
            }
          }
          toast.success(`Updated "${formName.trim()}"`)
          navigate('/')
        }
      }
    } catch {
      toast.error('Failed to save mini app')
    }
    setSaving(false)
  }

  // Get current code value based on active tab
  const currentCode =
    activeTab === 'frontend'
      ? formFrontendCode
      : activeTab === 'backend'
        ? formBackendCode
        : formPanelCode

  const handleCodeChange = (value: string | undefined) => {
    const code = value || ''
    if (activeTab === 'frontend') setFormFrontendCode(code)
    else if (activeTab === 'backend') setFormBackendCode(code)
    else setFormPanelCode(code)
  }

  const tabs: { key: CodeTab; label: string; icon: React.ReactNode }[] = [
    { key: 'frontend', label: 'Frontend', icon: <Code size={13} /> },
    { key: 'backend', label: 'Backend', icon: <Terminal size={13} /> },
    { key: 'panel', label: 'Panel', icon: <Settings size={13} /> },
    { key: 'preview', label: 'Preview', icon: <Eye size={13} /> },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-(--color-hairline) shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-7 h-7 flex items-center justify-center rounded-sm bg-transparent border border-(--color-hairline) text-(--color-body) cursor-pointer transition-all duration-150 hover:bg-(--color-canvas-soft) hover:text-(--color-ink)"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-(--color-ink) leading-tight">
              {isCreating ? 'New Mini App' : formName || 'Edit App'}
            </h2>
            <p className="text-[11px] text-(--color-mute)">
              {isCreating ? 'Create a new mini app' : `Editing · v${formVersion}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="primary"
            size="small"
            icon={<Save size={13} />}
            onClick={handleSave}
            loading={saving}
          >
            {isCreating ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-end gap-3 px-5 py-3 border-b border-(--color-hairline) shrink-0 bg-(--color-canvas)">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute) mb-1 block">
            Name
          </span>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="My Mini App"
            size="small"
          />
        </div>
        <div className="w-25 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute) mb-1 block">
            Version
          </span>
          <Input
            value={formVersion}
            onChange={(e) => setFormVersion(e.target.value)}
            placeholder="1.0.0"
            size="small"
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute) mb-1 block">
            Description
          </span>
          <Input
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="What does this app do?"
            size="small"
          />
        </div>
        <div className="w-30 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute) mb-1 block">
            Icon
          </span>
          <Select
            value={formIcon}
            onChange={setFormIcon}
            options={ICON_CATALOG.map((i) => ({ value: i.name, label: `${i.emoji}  ${i.name}` }))}
            size="small"
            className="w-full"
            showSearch
          />
        </div>
      </div>

      {/* Config bar (only when editing and config exists) */}
      {configSchema && Object.keys(configSchema).length > 0 && (
        <div className="flex items-end gap-3 px-5 py-3 border-b border-(--color-hairline) shrink-0 bg-(--color-canvas)">
          <div className="flex items-center gap-1.5 mr-1 shrink-0 pb-1">
            <Settings size={12} className="text-(--color-primary)" />
            <span className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute)">
              Config
            </span>
          </div>
          {Object.entries(configSchema).map(([key, field]: [string, any]) => (
            <div key={key} className="min-w-35">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[11px] font-medium text-(--color-ink)">
                  {field.label || key}
                </span>
                {field.required && <span className="text-[10px] text-red-400">*</span>}
              </div>
              {field.type === 'boolean' ? (
                <Switch
                  size="small"
                  checked={!!configValues[key]}
                  onChange={(checked) => setConfigValues((prev) => ({ ...prev, [key]: checked }))}
                />
              ) : field.type === 'number' ? (
                <InputNumber
                  value={configValues[key] ?? field.default ?? ''}
                  onChange={(val) => setConfigValues((prev) => ({ ...prev, [key]: val }))}
                  placeholder={field.default !== undefined ? String(field.default) : ''}
                  size="small"
                  className="w-full"
                />
              ) : (
                <Input
                  value={configValues[key] ?? field.default ?? ''}
                  onChange={(e) =>
                    setConfigValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder={field.default !== undefined ? String(field.default) : ''}
                  size="small"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Code Editor + Logs + AI Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor area + Logs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-(--color-hairline) shrink-0 bg-(--color-canvas)">
            <div className="flex items-center gap-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key)
                    if (tab.key === 'preview') setPreviewKey((k) => k + 1)
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium cursor-pointer transition-colors duration-150 border-b-2 bg-transparent border-x-0 border-t-0 ${
                    activeTab === tab.key
                      ? 'text-(--color-primary) border-(--color-primary)'
                      : 'text-(--color-mute) border-transparent hover:text-(--color-body)'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.key === 'panel' && (
                    <span className="text-[9px] text-(--color-mute) ml-0.5">opt</span>
                  )}
                </button>
              ))}
            </div>
            {/* Logs toggle */}
            {!isCreating && (
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className={`flex items-center gap-1.5 px-3 py-1 mr-2 text-[11px] font-medium rounded-sm border cursor-pointer transition-colors ${
                  showLogs
                    ? 'bg-(--color-primary)/10 border-(--color-primary)/20 text-(--color-primary)'
                    : 'bg-transparent border-(--color-hairline) text-(--color-mute) hover:text-(--color-body)'
                }`}
              >
                <Terminal size={11} />
                Logs
                {logs.length > 0 && (
                  <span className="text-[9px] bg-(--color-primary)/20 text-(--color-primary) px-1 rounded-full">
                    {logs.length}
                  </span>
                )}
                <ChevronDown
                  size={10}
                  className={`transition-transform ${showLogs ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Main content area (editor/preview + logs) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor / Preview */}
            <div className={`overflow-hidden ${showLogs ? 'flex-1 min-h-0' : 'flex-1'}`}>
              {activeTab === 'preview' ? (
                /* Live Preview */
                appId ? (
                  <div className="h-full bg-(--color-canvas-soft) overflow-auto">
                    <MiniAppRenderer key={previewKey} appId={appId} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Eye size={32} className="text-(--color-mute) mx-auto mb-2" />
                      <p className="text-[12px] text-(--color-mute)">
                        Save the app first to preview
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <Editor
                  language="javascript"
                  theme="vs"
                  value={currentCode}
                  onChange={handleCodeChange}
                  options={MONACO_OPTIONS}
                  beforeMount={handleEditorBeforeMount}
                />
              )}
            </div>

            {/* Logs Panel */}
            {showLogs && (
              <div className="h-50 shrink-0 border-t border-(--color-hairline) flex flex-col bg-(--color-canvas-soft)">
                {/* Logs header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-(--color-hairline) shrink-0">
                  <div className="flex items-center gap-2">
                    <Terminal size={11} className="text-(--color-mute)" />
                    <span className="text-[11px] font-semibold text-(--color-body)">
                      Backend Logs
                    </span>
                    <span className="text-[10px] text-(--color-mute)">{logs.length} entries</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-(--color-mute) bg-transparent border-none cursor-pointer hover:text-(--color-body) transition-colors"
                  >
                    <Trash2 size={10} />
                    Clear
                  </button>
                </div>
                {/* Logs content */}
                <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono">
                  {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-[11px] text-(--color-mute) opacity-50">
                        No logs yet. Backend ctx.log() output will appear here.
                      </span>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 py-0.5 text-[11px]">
                        <span className="text-(--color-mute) shrink-0 select-none">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-(--color-body) whitespace-pre-wrap break-all">
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
