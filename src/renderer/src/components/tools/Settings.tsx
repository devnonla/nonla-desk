import { Check, Copy, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from '../ui/Toast'

const SERVER_KEY = 'nonla-desk'
const FALLBACK_PORT = import.meta.env.DEV ? 24817 : 24816

type ClientId = 'cursor' | 'antigravity' | 'claude'
type McpInfo = { port: number; url: string; listening: boolean }

function clientsFor(url: string): {
  id: ClientId
  label: string
  path: string
  note: string
  config: Record<string, unknown>
}[] {
  return [
    {
      id: 'cursor',
      label: 'Cursor',
      path: '~/.cursor/mcp.json  or  .cursor/mcp.json',
      note: 'Remote servers use url. Cursor infers Streamable HTTP from that field.',
      config: {
        mcpServers: {
          [SERVER_KEY]: { url },
        },
      },
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      path: '~/.gemini/config/mcp_config.json  or  .agents/mcp_config.json',
      note: 'Remote servers use serverUrl, not url.',
      config: {
        mcpServers: {
          [SERVER_KEY]: { serverUrl: url },
        },
      },
    },
    {
      id: 'claude',
      label: 'Claude Code',
      path: '~/.claude.json  or  .mcp.json',
      note: 'HTTP servers require type plus url. Claude Desktop JSON only accepts stdio; add this URL as a Custom Connector, or wrap it with mcp-remote.',
      config: {
        mcpServers: {
          [SERVER_KEY]: { type: 'http', url },
        },
      },
    },
  ]
}

function McpSection() {
  const [active, setActive] = useState<ClientId>('cursor')
  const [copied, setCopied] = useState(false)
  const [mcp, setMcp] = useState<McpInfo>({
    port: FALLBACK_PORT,
    url: `http://127.0.0.1:${FALLBACK_PORT}/mcp`,
    listening: true,
  })

  useEffect(() => {
    void window.api.getMcpInfo().then((info: McpInfo) => {
      if (info?.url) setMcp(info)
    })
  }, [])

  const clients = useMemo(() => clientsFor(mcp.url), [mcp.url])
  const client = clients.find((c) => c.id === active) ?? clients[0]
  const json = JSON.stringify(client.config, null, 2)

  const copyConfig = () => {
    navigator.clipboard.writeText(json)
    setCopied(true)
    toast.success(`Copied ${client.label} config`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-(--color-ink) mb-1">MCP Server</h3>
      <p className="text-[13px] leading-5 text-(--color-body) mb-4 max-w-140">
        Nonla Desk serves Streamable HTTP at{' '}
        <code className="font-mono text-[12px] text-(--color-ink)">{mcp.url}</code>
        {import.meta.env.DEV ? ' (dev port 24817; packaged builds use 24816)' : ''}. Paste the
        snippet for your client. Keep Nonla Desk running while the harness is connected.
      </p>
      {!mcp.listening && (
        <p className="text-[13px] leading-5 text-(--color-error) mb-4">
          MCP server is not listening on this port. Another instance may already be using it.
        </p>
      )}

      <div className="flex gap-1 mb-3">
        {clients.map((c) => {
          const selected = c.id === active
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActive(c.id)
                setCopied(false)
              }}
              className={`h-8 px-3 text-[12px] font-semibold rounded-sm border cursor-pointer transition-colors ${
                selected
                  ? 'bg-(--color-primary) text-(--color-on-primary) border-transparent'
                  : 'bg-transparent text-(--color-body) border-(--color-hairline) hover:bg-(--color-bg-hover) hover:text-(--color-ink)'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="border border-(--color-hairline) rounded-lg bg-(--color-canvas-soft) p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[2px] text-(--color-mute) mb-1">
              Config file
            </div>
            <code className="block text-[12px] font-mono text-(--color-ink) break-all">
              {client.path}
            </code>
          </div>
          <button
            type="button"
            className="shrink-0 flex items-center gap-1 text-[10px] text-(--color-primary) bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80"
            onClick={copyConfig}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </div>
        <pre className="text-xs font-mono text-(--color-body) bg-(--color-canvas) border border-(--color-hairline) rounded-md p-3 overflow-x-auto m-0 leading-relaxed">
          {json}
        </pre>
        <p className="text-[12px] leading-5 text-(--color-mute) mt-3 m-0">{client.note}</p>
      </div>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="flex flex-col items-start pt-2 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={16} className="text-(--color-primary)" />
          <span className="text-sm font-semibold tracking-[2.52px] uppercase text-(--color-primary) font-sans">
            SETTINGS
          </span>
        </div>

        <h1 className="text-[36px] font-normal tracking-[-0.9px] leading-10 text-(--color-ink-strong) m-0 mb-3">
          App <span className="text-(--color-primary)">Settings</span>
        </h1>

        <p className="text-base font-normal leading-6.5 text-(--color-body) max-w-120 m-0">
          Connect other AI harnesses to this app over MCP.
        </p>
      </div>

      <div className="w-full h-px border-t border-dashed border-[rgba(79,93,117,0.4)] mb-8" />

      <McpSection />
    </div>
  )
}
