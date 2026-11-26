import { CodeBlock, Paragraph, Title } from 'devnonla-ui'
import { useId } from 'react'
import AppLogo from '../ui/AppLogo'

const CLAUDE_CODE = `/plugin marketplace add devnonla/nonla-desk
/plugin install nonla-desk@nonla-desk`

const OTHER_AGENTS =
  'Use the `nonladesk` CLI to build Nonla Desk mini apps. Run `nonladesk guide` first.'

/** Shown on an empty desktop: an agent writes mini apps through the `nonladesk` CLI. */
export function CliOnboarding() {
  const titleId = useId()

  return (
    <div className="absolute inset-x-0 top-11 bottom-0 z-30 flex items-center justify-center px-6">
      <div
        role="dialog"
        aria-labelledby={titleId}
        className="w-full max-w-120 bg-card border border-border rounded-lg shadow-[0_24px_50px_rgba(20,30,10,0.35)] overflow-hidden"
      >
        <div className="p-6 flex flex-col gap-4">
          <AppLogo size={40} />
          <div className="flex flex-col gap-1">
            <Title level={4} id={titleId}>
              Write tools with your agent
            </Title>
            <Paragraph className="text-muted-foreground">
              Your coding agent creates mini apps with the <code>nonladesk</code> CLI. Keep Nonla
              Desk running in the menu bar. Nothing to sign in to: it all stays on this Mac.
            </Paragraph>
          </div>
          <CodeBlock code={CLAUDE_CODE} title="Claude Code: add the skill" />
          <CodeBlock code={OTHER_AGENTS} title="Other agents: paste this" wordWrap />
        </div>
      </div>
    </div>
  )
}
