import { Bot, Plug } from 'lucide-react'
import { useId } from 'react'
import AppLogo from '../ui/AppLogo'
import { Button } from '../ui/Button'

const STEPS = [
  'Open Agent on the right and add an LLM key in Settings, or copy the MCP snippet for Cursor.',
  'Keep Nonla Desk running while the agent writes tools.',
  'Ask it to create a mini app.',
]

interface McpOnboardingProps {
  onConnect: () => void
  onOpenAgent?: () => void
}

export function McpOnboarding({ onConnect, onOpenAgent }: McpOnboardingProps) {
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
            Write tools with Agent
          </h2>
          <p id={bodyId} className="text-[13px] leading-5 text-(--color-body) m-0 mb-5">
            Open Agent on the right to chat, or connect Cursor over MCP. Either way Nonla Desk must
            stay running.
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
          <Button type="default" onClick={onConnect}>
            Open Settings
          </Button>
          <Button type="primary" icon={<Bot size={14} />} onClick={onOpenAgent || onConnect}>
            Open Agent
          </Button>
        </div>
      </div>
    </div>
  )
}
