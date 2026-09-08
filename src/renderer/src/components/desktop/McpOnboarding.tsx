import { Plug } from 'lucide-react'
import { useId } from 'react'
import AppLogo from '../ui/AppLogo'
import { Button } from '../ui/Button'

const STEPS = [
  'Open Settings and copy the MCP snippet for Cursor, Claude Code, or Antigravity.',
  "Paste it into that editor's MCP config, then reload the editor.",
  'Keep Nonla Desk running. Ask the agent to create a mini app / tool.',
]

interface McpOnboardingProps {
  onConnect: () => void
}

export function McpOnboarding({ onConnect }: McpOnboardingProps) {
  const titleId = useId()
  const bodyId = useId()

  return (
    <div className="absolute inset-y-0 left-27 right-27 z-40 flex items-center justify-center px-6">
      <div
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-110 bg-(--color-canvas) border border-(--color-hairline) rounded-md shadow-[0_24px_50px_rgba(20,30,10,0.35)] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <AppLogo size={40} />
            <div className="w-8 h-8 rounded-sm flex items-center justify-center bg-(--color-primary-glow) border border-(--color-primary)/25">
              <Plug size={16} className="text-(--color-primary-deep)" />
            </div>
          </div>

          <h2
            id={titleId}
            className="text-[22px] font-semibold tracking-[-0.4px] leading-7 text-(--color-ink-strong) m-0 mb-2"
          >
            Connect MCP to write tools
          </h2>
          <p id={bodyId} className="text-[13px] leading-5 text-(--color-body) m-0 mb-5">
            Mini apps are written from an AI editor, not from this window. Connect MCP first or
            there is nothing for the agent to talk to.
          </p>

          <ol className="m-0 pl-5 flex flex-col gap-2.5">
            {STEPS.map((step) => (
              <li key={step} className="text-[13px] leading-5 text-(--color-ink)">
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-(--color-hairline) bg-(--color-canvas-soft)">
          <Button type="primary" onClick={onConnect}>
            Open Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
