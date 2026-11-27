import { Button, CodeBlock, Input, Kbd, Paragraph, Title } from 'devnonla-ui'
import { useEffect, useRef, useState } from 'react'
import { useMarketUpdates } from '@/hooks/useMarketUpdates'
import { useWindows } from '@/hooks/useWindows'
import { api, type MarketApp, type MarketUpdate } from '@/lib/api'
import { CLAUDE_CODE, OTHER_AGENTS } from '../desktop/CliOnboarding'
import AppLogo from '../ui/AppLogo'
import { confirm } from '../ui/ConfirmDialog'
import { toast } from '../ui/Toast'

const REPO = 'https://github.com/devnonla/nonla-desk'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Search and open apps' },
  { keys: ['⌘', 'O'], label: 'Import a mini app (.zip)' },
  { keys: ['⌘', 'B'], label: 'Back to all apps' },
  { keys: ['⇧', '↑'], label: 'Expand or restore the focused window' },
]

type Pane = 'desk' | 'apps'

interface UpdateInfo {
  version: string
  supported: boolean
  pending: string | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-(--color-mute)">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** One row of a bordered list: text on the left, an action on the right. */
function Row({
  title,
  detail,
  children,
}: {
  title: string
  detail?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-col min-w-0">
        <span className="truncate text-[13px] font-medium text-(--color-ink)">{title}</span>
        {detail && <span className="truncate text-[12px] text-(--color-mute)">{detail}</span>}
      </div>
      {children}
    </div>
  )
}

function SidebarItem({
  active,
  label,
  dot,
  onClick,
}: {
  active: boolean
  label: string
  dot: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={dot ? `${label}: update available` : label}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] border-none cursor-default ${
        active
          ? 'bg-(--color-primary)/15 font-medium text-(--color-ink)'
          : 'bg-transparent text-(--color-body) hover:bg-black/5'
      }`}
    >
      <span className="truncate">{label}</span>
      {dot && <span aria-hidden className="size-2 rounded-full bg-red-500" />}
    </button>
  )
}

/** What to paste to the agent: review this one update, then install it only after a yes. */
const updatePrompt = (u: MarketUpdate) =>
  `Use the nonla-market skill to review the update of the mini app ${u.name}@${u.market} ` +
  `(installed ${u.installed}, new ${u.version}): run \`nonladesk market diff ${u.name}@${u.market}\`, ` +
  'read every change, tell me what changed and any risk, and update only this app after I say yes.'

/** What to paste to the agent: review a new app, then install it only after a yes. */
const installPrompt = (a: MarketApp) =>
  `Use the nonla-market skill to review the mini app ${a.name}@${a.market}: run ` +
  `\`nonladesk market show ${a.name}@${a.market}\`, read every file, tell me what it does and ` +
  'any risk, and install it only after I say yes.'

const RISK =
  'A mini app runs with your full rights: its backend can read your files, run commands and use ' +
  'the network. Install only apps you trust, or let your agent review the code first.'

async function copyPrompt(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied. Paste it to your agent.')
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

function DeskPane({
  info,
  checking,
  onCheck,
}: {
  info: UpdateInfo | null
  checking: boolean
  onCheck: () => void
}) {
  return (
    <>
      <header className="flex items-center gap-4">
        <AppLogo size={64} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <Title level={3}>Nonla Desk</Title>
          <span className="text-[13px] text-(--color-mute)">
            {info ? `Version ${info.version}` : ' '}
          </span>
        </div>
      </header>

      <Paragraph className="text-muted-foreground">
        A desktop for small tools. Each tool is a mini app: a React window with an optional
        background process and menu bar panel. Your coding agent writes them, and everything stays
        on this Mac. Nothing to sign in to.
      </Paragraph>

      {info && (
        <Section title="Updates">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <span className="text-[13px] text-(--color-body)">
              {info.pending
                ? `Version ${info.pending} is available.`
                : info.supported
                  ? 'You are on the latest version.'
                  : 'Updates are off in this build.'}
            </span>
            {info.supported && (
              <Button
                type={info.pending ? 'primary' : 'default'}
                loading={checking}
                onClick={onCheck}
              >
                {info.pending ? 'Install update' : 'Check for updates'}
              </Button>
            )}
          </div>
        </Section>
      )}

      <Section title="Build mini apps with your agent">
        <CodeBlock code={CLAUDE_CODE} title="Claude Code: add the skill" />
        <CodeBlock code={OTHER_AGENTS} title="Other agents: paste this" wordWrap />
        <Paragraph className="text-muted-foreground">
          The <code>nonladesk</code> CLI is linked at <code>~/.local/bin</code>. Run{' '}
          <code>nonladesk guide</code> for the full guide.
        </Paragraph>
      </Section>

      <Section title="Shortcuts">
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-(--color-body)">{s.label}</span>
              <Kbd keys={s.keys} />
            </li>
          ))}
        </ul>
      </Section>

      <footer className="pt-1">
        <Button type="text" onClick={() => void api.openUrl(REPO)}>
          GitHub
        </Button>
      </footer>
    </>
  )
}

function AppsPane({ market }: { market: ReturnType<typeof useMarketUpdates> }) {
  const { markets, updates, apps, checking, check, reload } = market
  const { open } = useWindows()
  const [busy, setBusy] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [adding, setAdding] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const install = (a: MarketApp) => {
    const ref = `${a.name}@${a.market}`
    const isUpdate = Boolean(a.installed)
    confirm({
      title: isUpdate
        ? `Update ${a.title || a.name} to ${a.version}?`
        : `Install ${a.name} from ${a.market}?`,
      content: isUpdate
        ? `${RISK} The new code replaces version ${a.installed}; it stays on or off as it is now.`
        : `${RISK} It is installed turned off: open its details to turn it on.`,
      okText: isUpdate ? 'Update' : 'Install',
      onOk: async () => {
        setBusy(ref)
        const r = await api.marketInstall(ref)
        setBusy(null)
        if (!r.success) {
          toast.error(r.error)
          return
        }
        toast.success(r.updated ? `Updated "${r.name}"` : `Installed "${r.name}" (turned off)`)
        if (!r.updated) open('info', r.id)
      },
    })
  }

  const importZip = async (file: File) => {
    const buffer = await file.arrayBuffer()
    confirm({
      title: `Import ${file.name}?`,
      content: `${RISK} It is imported turned off. An app with the same id is not replaced.`,
      okText: 'Import',
      onOk: async () => {
        const r = await api.importMiniAppZip(buffer)
        if (!r.success) {
          toast.error(r.error)
          return
        }
        toast.success(`Imported "${file.name}" (turned off)`)
        open('info', r.id)
      },
    })
  }

  const add = async () => {
    const value = source.trim()
    if (!value) return
    setAdding(true)
    const r = await api.marketAdd(value)
    setAdding(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    setSource('')
    toast.success(`Added "${r.name}" with ${r.apps} app${r.apps === 1 ? '' : 's'}`)
    void reload()
  }

  const remove = (name: string) =>
    confirm({
      title: `Remove the marketplace ${name}?`,
      content: 'Apps installed from it stay, but no longer get updates from it.',
      okText: 'Remove',
      okButtonProps: { danger: true },
      onOk: async () => {
        const r = await api.marketRemove(name)
        if (!r.success) toast.error(r.error)
        else void reload()
      },
    })

  const available = apps.filter((a) => !a.installed)
  const installed = apps.filter((a) => a.installed && !a.update)

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Title level={3}>Mini apps</Title>
          <span className="text-[13px] text-(--color-mute)">
            Install apps from marketplaces or a zip. They come in turned off.
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => fileRef.current?.click()}>Import zip</Button>
          {markets.length > 0 && (
            <Button loading={checking} onClick={() => void check()}>
              Check now
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importZip(file)
            e.target.value = ''
          }}
        />
      </header>

      {updates.length > 0 && (
        <Section title="Updates">
          <div className="flex flex-col rounded-lg border border-border">
            {updates.map((u) => (
              <Row
                key={`${u.market}/${u.name}`}
                title={u.title || u.name}
                detail={`${u.name}@${u.market} · ${u.installed} → ${u.version}`}
              >
                <div className="flex shrink-0 gap-1">
                  <Button type="text" onClick={() => void copyPrompt(updatePrompt(u))}>
                    Review prompt
                  </Button>
                  <Button
                    type="primary"
                    loading={busy === `${u.name}@${u.market}`}
                    onClick={() =>
                      install({
                        ...u,
                        description: null,
                        category: null,
                        update: true,
                      })
                    }
                  >
                    Update
                  </Button>
                </div>
              </Row>
            ))}
          </div>
        </Section>
      )}

      {markets.length > 0 && (
        <Section title="Available">
          <div className="flex flex-col rounded-lg border border-border">
            {available.length === 0 ? (
              <Row title="Nothing new" detail="Every app of your marketplaces is installed." />
            ) : (
              available.map((a) => (
                <Row
                  key={`${a.market}/${a.name}`}
                  title={a.name}
                  detail={`${a.description || a.category || ''} · ${a.version} · ${a.market}`}
                >
                  <div className="flex shrink-0 gap-1">
                    <Button type="text" onClick={() => void copyPrompt(installPrompt(a))}>
                      Review prompt
                    </Button>
                    <Button loading={busy === `${a.name}@${a.market}`} onClick={() => install(a)}>
                      Install
                    </Button>
                  </div>
                </Row>
              ))
            )}
          </div>
        </Section>
      )}

      {installed.length > 0 && (
        <Section title="Installed from marketplaces">
          <div className="flex flex-col rounded-lg border border-border">
            {installed.map((a) => (
              <Row
                key={`${a.market}/${a.name}`}
                title={a.title || a.name}
                detail={`${a.name}@${a.market} · ${a.installed} · up to date`}
              >
                {a.appId && (
                  <Button type="text" onClick={() => open('info', a.appId ?? undefined)}>
                    Details
                  </Button>
                )}
              </Row>
            ))}
          </div>
        </Section>
      )}

      <Section title="Marketplaces">
        <div className="flex flex-col rounded-lg border border-border">
          {markets.map((m) => (
            <Row
              key={m.name}
              title={m.name}
              detail={`${m.apps} app${m.apps === 1 ? '' : 's'} · ${m.source}`}
            >
              <Button type="text" onClick={() => remove(m.name)}>
                Remove
              </Button>
            </Row>
          ))}
          <form
            className="flex items-center gap-2 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="user/repo, e.g. devnonla/nonladesk-apps"
              className="flex-1"
            />
            <Button htmlType="submit" type="primary" loading={adding} disabled={!source.trim()}>
              Add
            </Button>
          </form>
        </div>
        <Paragraph className="text-muted-foreground">
          A marketplace is someone's git repo of mini apps. Adding one only downloads its list;
          nothing is installed until you choose.
        </Paragraph>
      </Section>
    </>
  )
}

/** The Nonla Desk window: the desk itself (version, updates, how to build apps) and mini app updates. */
export default function AboutWindow() {
  const [pane, setPane] = useState<Pane>('desk')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const market = useMarketUpdates()

  useEffect(() => {
    void api.getUpdateInfo().then(setInfo)
    return api.onUpdatePending((pending) =>
      setInfo((current) => (current ? { ...current, pending } : current)),
    )
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      await api.checkForUpdates()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="h-full flex bg-card">
      <nav className="w-44 shrink-0 flex flex-col gap-1 border-r border-border p-3">
        <SidebarItem
          active={pane === 'desk'}
          label="Nonla Desk"
          dot={Boolean(info?.pending)}
          onClick={() => setPane('desk')}
        />
        <SidebarItem
          active={pane === 'apps'}
          label={market.updates.length ? `Mini apps (${market.updates.length})` : 'Mini apps'}
          dot={market.updates.length > 0}
          onClick={() => setPane('apps')}
        />
      </nav>
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-130 px-8 py-8 flex flex-col gap-7">
          {pane === 'desk' ? (
            <DeskPane info={info} checking={checking} onCheck={() => void check()} />
          ) : (
            <AppsPane market={market} />
          )}
        </div>
      </div>
    </div>
  )
}
