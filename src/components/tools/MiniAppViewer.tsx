import { Button, Card, CodeBlock, Input, InputNumber, Switch, Tabs } from 'devnonla-ui'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useMiniAppChanges } from '../../hooks/useMiniAppChanges'
import { AppIcon } from '../desktop/AppIcon'
import { toast } from '../ui/Toast'

/**
 * Read-only view of a mini app: what it is, its code, its logs. Code is written by
 * an agent through the `nonladesk` CLI; the only thing people enter here is the
 * app's own settings (config values), which nothing else can set.
 */

interface AppDetail {
  id: string
  name: string
  description: string
  icon: string
  iconSvg: string | null
  category: string
  version: string
  enabled: boolean
  frontendCode: string
  backendCode: string
  panelCode: string | null
  paths: { dir: string; frontend: string; backend: string; panel: string }
}

interface ConfigField {
  type: 'string' | 'number' | 'boolean'
  label?: string
  description?: string
  required?: boolean
  default?: unknown
}

interface LogLine {
  timestamp: number
  stream: string
  text: string
}

const LOG_COLORS: Record<string, string> = {
  error: 'text-destructive',
  stderr: 'text-destructive',
  system: 'text-tertiary-foreground',
}

function CodeView({
  code,
  path,
  language,
  what,
}: {
  code: string
  path: string
  language: string
  what: string
}) {
  if (!code.trim()) {
    return <p className="m-0 p-6 text-sm text-muted-foreground">This app has no {what} code.</p>
  }
  return (
    <div className="p-4">
      <CodeBlock
        code={code}
        language={language}
        title={path}
        lineNumbers
        className="[&_.nonla-codeblock-body]:max-h-none"
      />
    </div>
  )
}

function SettingsForm({ appId, schema }: { appId: string; schema: Record<string, ConfigField> }) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void api.getMiniAppConfig(appId).then((r) => {
      if (r.success) setValues(r.values ?? {})
    })
  }, [appId])

  const save = async () => {
    setSaving(true)
    for (const [key, value] of Object.entries(values)) {
      const r = await api.setMiniAppConfig(appId, key, value)
      if (!r.success) {
        setSaving(false)
        toast.error(r.error)
        return
      }
    }
    setSaving(false)
    toast.success('Settings saved. Reload the app to use them.')
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <Card
        title="Settings"
        caption="Values this app asks for (API keys, options). Stored on this Mac."
      >
        {Object.entries(schema).map(([key, field]) => {
          const value = values[key] ?? field.default
          return (
            <Card.Item
              key={key}
              label={
                <span>
                  {field.label || key}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </span>
              }
              description={field.description}
            >
              {field.type === 'boolean' ? (
                <Switch
                  checked={Boolean(value)}
                  onChange={(checked) => setValues((v) => ({ ...v, [key]: checked }))}
                />
              ) : field.type === 'number' ? (
                <InputNumber
                  value={typeof value === 'number' ? value : null}
                  onChange={(n) => setValues((v) => ({ ...v, [key]: n }))}
                  className="w-48"
                />
              ) : (
                <Input
                  value={typeof value === 'string' ? value : value == null ? '' : String(value)}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="w-64"
                />
              )}
            </Card.Item>
          )
        })}
      </Card>
      <div className="flex justify-end">
        <Button type="primary" loading={saving} onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  )
}

function LogsView({ appId }: { appId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api.getMiniAppLogs(appId).then(setLines)
    return api.onMiniAppLog((msg) => {
      if (msg.appId !== appId) return
      setLines((prev) => [
        ...prev.slice(-299),
        { timestamp: msg.timestamp, stream: msg.stream, text: msg.args.join(' ') },
      ])
    })
  }, [appId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new lines
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  if (lines.length === 0) {
    return (
      <p className="m-0 p-6 text-sm text-muted-foreground">
        No logs yet. Backend <code>ctx.log()</code>, stdout/stderr and crashes show here.
      </p>
    )
  }
  return (
    <div className="p-4 font-mono text-xs leading-5">
      {lines.map((l, i) => (
        <div key={`${l.timestamp}-${i}`} className="flex gap-3 whitespace-pre-wrap break-all">
          <span className="shrink-0 text-tertiary-foreground tabular-nums">
            {new Date(l.timestamp).toLocaleTimeString()}
          </span>
          <span className={LOG_COLORS[l.stream] ?? 'text-foreground'}>{l.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

export default function MiniAppViewer({ appId }: { appId: string }) {
  const [app, setApp] = useState<AppDetail | null>(null)
  const [schema, setSchema] = useState<Record<string, ConfigField> | null>(null)
  const [tab, setTab] = useState('frontend')
  const [toggling, setToggling] = useState(false)
  const [standalone, setStandalone] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  const load = async () => {
    const detail = await api.getMiniApp(appId)
    setApp(detail)
    setStandalone(await api.standalonePath(appId))
    const config = await api.getMiniAppConfig(appId)
    setSchema(
      config.success && config.schema && Object.keys(config.schema).length ? config.schema : null,
    )
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the app changes
  useEffect(() => {
    void load()
  }, [appId])

  useMiniAppChanges((event) => {
    if (event.id === appId && event.action !== 'deleted') void load()
  })

  if (!app) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const toggle = async () => {
    setToggling(true)
    const r = await api.toggleMiniApp(appId)
    setToggling(false)
    if (r.missingConfigs?.length) {
      toast.warning(`Fill in ${r.missingConfigs.join(', ')} first`)
      setTab('settings')
    } else if (!r.success && 'error' in r) {
      toast.error(String(r.error))
    }
  }

  const installStandalone = async () => {
    setInstalling(true)
    const r = await api.installStandalone(appId)
    setInstalling(false)
    if (r.success) {
      setStandalone(r.path)
      toast.success('Added to Applications')
      await api.openStandalone(appId)
    } else {
      toast.error(r.error)
    }
  }

  const removeStandalone = async () => {
    const r = await api.uninstallStandalone(appId)
    if (r.success) setStandalone(null)
    else toast.error(r.error)
  }

  const tabs = [
    { key: 'frontend', label: 'Frontend' },
    { key: 'backend', label: 'Backend' },
    ...(app.panelCode ? [{ key: 'panel', label: 'Panel' }] : []),
    ...(schema ? [{ key: 'settings', label: 'Settings' }] : []),
    { key: 'logs', label: 'Logs' },
  ]

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="shrink-0 flex items-center gap-4 px-5 pt-5 pb-4">
        <AppIcon name={app.icon} svg={app.iconSvg} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 truncate text-base font-semibold text-foreground">{app.name}</h2>
            <span className="shrink-0 text-xs text-tertiary-foreground tabular-nums">
              v{app.version}
            </span>
          </div>
          <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">
            {app.description || 'No description'}
          </p>
        </div>
        {standalone ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => void api.openStandalone(appId)}>Open app</Button>
            <Button type="text" onClick={removeStandalone}>
              Remove
            </Button>
          </div>
        ) : (
          <Button loading={installing} onClick={installStandalone}>
            Add to Applications
          </Button>
        )}
        <Switch
          checked={app.enabled}
          disabled={toggling}
          onChange={toggle}
          aria-label={app.enabled ? 'Turn off' : 'Turn on'}
        />
      </header>

      <Tabs
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        className="shrink-0 px-5"
        aria-label="App files"
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'frontend' ? (
          <CodeView
            code={app.frontendCode}
            path={app.paths.frontend}
            language="jsx"
            what="frontend"
          />
        ) : tab === 'backend' ? (
          <CodeView
            code={app.backendCode}
            path={app.paths.backend}
            language="javascript"
            what="backend"
          />
        ) : tab === 'panel' ? (
          <CodeView code={app.panelCode ?? ''} path={app.paths.panel} language="jsx" what="panel" />
        ) : tab === 'settings' && schema ? (
          <SettingsForm appId={appId} schema={schema} />
        ) : (
          <LogsView appId={appId} />
        )}
      </div>
    </div>
  )
}
