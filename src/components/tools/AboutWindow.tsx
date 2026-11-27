import { Button, CodeBlock, Kbd, Paragraph, Title } from 'devnonla-ui'
import { useEffect, useState } from 'react'
import { useMarketUpdates } from '@/hooks/useMarketUpdates'
import { api, type MarketUpdate } from '@/lib/api'
import { CLAUDE_CODE, OTHER_AGENTS } from '../desktop/CliOnboarding'
import AppLogo from '../ui/AppLogo'
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
const reviewPrompt = (u: MarketUpdate) =>
  `Use the nonla-market skill to review the update of the mini app ${u.name}@${u.market} ` +
  `(installed ${u.installed}, new ${u.version}): run \`nonladesk market diff ${u.name}@${u.market}\`, ` +
  'read every change, tell me what changed and any risk, and update only this app after I say yes.'

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
  const { markets, updates, checking, check } = market

  const copy = async (u: MarketUpdate) => {
    try {
      await navigator.clipboard.writeText(reviewPrompt(u))
      toast.success('Copied. Paste it to your agent.')
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Title level={3}>Mini apps</Title>
          <span className="text-[13px] text-(--color-mute)">
            Updates from your marketplaces. Your agent reviews each one before it is installed.
          </span>
        </div>
        {markets.length > 0 && (
          <Button loading={checking} onClick={() => void check()}>
            Check now
          </Button>
        )}
      </header>

      <Section title="Updates">
        <div className="flex flex-col rounded-lg border border-border">
          {updates.length === 0 ? (
            <Row
              title="Everything is up to date"
              detail={
                markets.length
                  ? 'No newer version in your marketplaces.'
                  : 'Add a marketplace to get updates.'
              }
            />
          ) : (
            updates.map((u) => (
              <Row
                key={`${u.market}/${u.name}`}
                title={u.title || u.name}
                detail={`${u.name}@${u.market} · ${u.installed} → ${u.version}`}
              >
                <Button type="primary" onClick={() => void copy(u)}>
                  Copy review prompt
                </Button>
              </Row>
            ))
          )}
        </div>
      </Section>

      <Section title="Marketplaces">
        {markets.length === 0 ? (
          <Paragraph className="text-muted-foreground">
            None yet. Ask your agent to add one, or run{' '}
            <code>nonladesk market add devnonla/nonladesk-apps</code> (any <code>user/repo</code>{' '}
            works).
          </Paragraph>
        ) : (
          <div className="flex flex-col rounded-lg border border-border">
            {markets.map((m) => (
              <Row
                key={m.name}
                title={m.name}
                detail={`${m.apps} app${m.apps === 1 ? '' : 's'} · ${m.source}`}
              />
            ))}
          </div>
        )}
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
