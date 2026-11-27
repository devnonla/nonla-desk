import { Button, Input, Paragraph, Tabs, Title } from 'devnonla-ui'
import { useEffect, useRef, useState } from 'react'
import { useWindows } from '@/hooks/useWindows'
import { api, type ImportPreview, type MarketListing } from '@/lib/api'
import { onZipQueued, takeZip } from '@/lib/import-queue'
import { AlertTriangle, ArrowLeft, Check, Upload } from '../ui/icons'
import { toast } from '../ui/Toast'

type Tab = 'zip' | 'market'

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

function Failure({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-(--color-error)/30 bg-(--color-error)/5 px-4 py-3 text-[13px] text-(--color-error)">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 wrap-break-word">{text}</span>
    </div>
  )
}

/** Why an install cannot go ahead, or null. A zip never replaces an app; a marketplace only updates its own. */
function blocker(p: ImportPreview) {
  if (!p.existing) return null
  if (p.market && p.existing.market === p.market) return null
  return `An app with the id "${p.id}" ("${p.existing.name}") is already installed${
    p.existing.market ? ` from ${p.existing.market}` : ''
  }. Delete it first to install this one.`
}

/** What will be installed, the checks, and the install button. */
function Preview({
  preview,
  busy,
  onInstall,
}: {
  preview: ImportPreview
  busy: boolean
  onInstall: () => void
}) {
  const blocked = blocker(preview)
  const update = Boolean(preview.existing && !blocked)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold text-(--color-ink)">{preview.name}</span>
        <span className="text-[12px] text-(--color-mute)">
          {preview.id} · v{preview.version}
          {preview.market
            ? ` · ${preview.market}${preview.commit ? ` @ ${preview.commit}` : ''}`
            : ''}
        </span>
        {preview.description && (
          <span className="text-[13px] text-(--color-body)">{preview.description}</span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5 rounded-lg border border-border px-4 py-3">
        {preview.checks.map((c) => (
          <li key={c.text} className="flex items-start gap-2 text-[13px]">
            {c.ok ? (
              <Check size={14} className="mt-0.5 shrink-0 text-green-600" />
            ) : (
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            )}
            <span className="text-(--color-body)">{c.text}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 text-[12px] text-(--color-mute)">
        {preview.files.map((f) => (
          <span key={f.path} className="flex justify-between gap-3 font-mono">
            <span>{f.path}</span>
            <span>{kb(f.bytes)}</span>
          </span>
        ))}
      </div>

      {blocked ? (
        <Failure text={blocked} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-(--color-mute)">
            {update
              ? `Replaces version ${preview.existing?.version}; stays on or off as it is.`
              : 'Installed turned off. Turn it on from its details when you are ready.'}
          </span>
          <Button type="primary" loading={busy} onClick={onInstall}>
            {update ? `Update to ${preview.version}` : 'Install'}
          </Button>
        </div>
      )}
    </div>
  )
}

function ZipTab({ onDone }: { onDone: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const pick = async (f: File) => {
    setPreview(null)
    setError(null)
    if (!f.name.endsWith('.zip')) {
      setError(`${f.name} is not a .zip file`)
      return
    }
    const buffer = await f.arrayBuffer()
    setFile({ name: f.name, buffer })
    const r = await api.inspectZip(buffer)
    if (r.success) setPreview(r.preview)
    else setError(r.error)
  }

  // A zip dropped on the desktop (now, or before this window loaded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pick is stable enough; subscribe once
  useEffect(() => {
    const take = () => {
      const f = takeZip()
      if (f) void pick(f)
    }
    take()
    return onZipQueued(take)
  }, [])

  const install = async () => {
    if (!file) return
    setBusy(true)
    const r = await api.importMiniAppZip(file.buffer)
    setBusy(false)
    if (!r.success) {
      setError(r.error)
      return
    }
    toast.success(`Installed "${preview?.name}" (turned off)`)
    setFile(null)
    setPreview(null)
    onDone(r.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void pick(f)
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 cursor-pointer text-[13px] text-(--color-body) ${
          dragOver
            ? 'border-(--color-primary) bg-(--color-primary)/10'
            : 'border-border bg-transparent'
        }`}
      >
        <Upload size={20} />
        <span className="font-medium">{file ? file.name : 'Choose a .zip, or drop it here'}</span>
        <span className="text-[12px] text-(--color-mute)">
          A mini app someone exported with Nonla Desk.
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />
      {error && <Failure text={error} />}
      {preview && <Preview preview={preview} busy={busy} onInstall={() => void install()} />}
    </div>
  )
}

function MarketTab({ onDone }: { onDone: (id: string) => void }) {
  // The official marketplace, ready to load; any user/repo works.
  const [source, setSource] = useState('devnonla/nonladesk-apps')
  const [loading, setLoading] = useState(false)
  const [market, setMarket] = useState<{ name: string; apps: MarketListing[] } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const value = source.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    setPreview(null)
    const r = await api.marketOpen(value)
    setLoading(false)
    if (r.success) setMarket({ name: r.name, apps: r.apps })
    else setError(r.error)
  }

  const inspect = async (a: MarketListing) => {
    const ref = `${a.name}@${a.market}`
    setChecking(ref)
    setError(null)
    const r = await api.marketInspect(ref)
    setChecking(null)
    if (r.success) setPreview(r.preview)
    else setError(r.error)
  }

  const install = async () => {
    if (!preview?.market) return
    setBusy(true)
    const r = await api.marketInstall(`${preview.id}@${preview.market}`)
    setBusy(false)
    if (!r.success) {
      setError(r.error)
      return
    }
    toast.success(r.updated ? `Updated "${r.name}"` : `Installed "${r.name}" (turned off)`)
    setPreview(null)
    setMarket(null)
    onDone(r.id)
  }

  if (preview) {
    return (
      <div className="flex flex-col gap-4">
        <Button type="text" className="self-start" onClick={() => setPreview(null)}>
          <ArrowLeft size={14} /> {market?.name ?? 'Back'}
        </Button>
        {error && <Failure text={error} />}
        <Preview preview={preview} busy={busy} onInstall={() => void install()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="user/repo, e.g. devnonla/nonladesk-apps"
          className="flex-1"
        />
        <Button htmlType="submit" type="primary" loading={loading} disabled={!source.trim()}>
          Load
        </Button>
      </form>
      <Paragraph className="text-muted-foreground">
        A marketplace is someone&apos;s git repo of mini apps. Loading it only downloads the list;
        nothing is installed until you choose an app.
      </Paragraph>
      {error && <Failure text={error} />}
      {market && (
        <div className="flex flex-col rounded-lg border border-border">
          {market.apps.length === 0 && (
            <span className="px-4 py-3 text-[13px] text-(--color-mute)">
              This marketplace is empty.
            </span>
          )}
          {market.apps.map((a) => {
            const ref = `${a.name}@${a.market}`
            return (
              <div
                key={ref}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-[13px] font-medium text-(--color-ink)">
                    {a.title || a.name}
                  </span>
                  <span className="truncate text-[12px] text-(--color-mute)">
                    {[
                      a.description,
                      `v${a.version}`,
                      a.update
                        ? `installed ${a.installed}, update available`
                        : a.installed && 'installed',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {a.installed && !a.update ? (
                  <span className="text-[12px] text-(--color-mute)">Installed</span>
                ) : (
                  <Button loading={checking === ref} onClick={() => void inspect(a)}>
                    {a.update ? 'Update…' : 'Install…'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Install a mini app from a zip or a marketplace: pick, check, install (turned off). */
export default function ImportWindow() {
  const [tab, setTab] = useState<Tab>('zip')
  const { open } = useWindows()
  const done = (id: string) => open('info', id)

  return (
    <div className="h-full overflow-y-auto bg-card">
      <div className="mx-auto max-w-3xl px-8 py-8 flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <Title level={3}>Import a mini app</Title>
          <span className="text-[13px] text-(--color-mute)">
            Pick a package, read the checks, then install. Apps run with your full rights, so only
            install ones you trust.
          </span>
        </header>
        <Tabs
          items={[
            { key: 'zip', label: 'From zip' },
            { key: 'market', label: 'From marketplace' },
          ]}
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          aria-label="Import from"
        />
        {tab === 'zip' ? <ZipTab onDone={done} /> : <MarketTab onDone={done} />}
      </div>
    </div>
  )
}
