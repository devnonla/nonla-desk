import { Button, CodeBlock, Kbd, Paragraph, Title } from 'devnonla-ui'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { CLAUDE_CODE, OTHER_AGENTS } from '../desktop/CliOnboarding'
import AppLogo from '../ui/AppLogo'

const REPO = 'https://github.com/devnonla/nonla-desk'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Search and open apps' },
  { keys: ['⌘', 'O'], label: 'Import a mini app (zip or marketplace)' },
  { keys: ['⌘', 'B'], label: 'Back to all apps' },
  { keys: ['⇧', '↑'], label: 'Expand or restore the focused window' },
]

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

/** The Nonla Desk page: what it is, the running version and updates, how to build apps. */
export default function AboutWindow() {
  const [info, setInfo] = useState<{
    version: string
    supported: boolean
    pending: string | null
  } | null>(null)
  const [checking, setChecking] = useState(false)

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
    <div className="h-full overflow-y-auto bg-card">
      <div className="mx-auto max-w-130 px-8 py-8 flex flex-col gap-7">
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
                  onClick={check}
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
      </div>
    </div>
  )
}
