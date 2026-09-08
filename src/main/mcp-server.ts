/**
 * Embedded MCP Server for Nonla Desk Mini Apps
 *
 * Runs as an HTTP server inside the Electron main process.
 * Uses StreamableHTTP transport — compatible with Cursor, Claude Desktop, etc.
 *
 * Ports: 24817 in `bun dev`, 24816 in packaged builds.
 * Settings UI reads the live port via IPC — do not hardcode in the renderer.
 *
 * MCP Config (replace PORT with the live value from Settings):
 *   Cursor:       { "url": "http://127.0.0.1:PORT/mcp" }
 *   Antigravity:  { "serverUrl": "http://127.0.0.1:PORT/mcp" }
 *   Claude Code:  { "type": "http", "url": "http://127.0.0.1:PORT/mcp" }
 */

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { is } from '@electron-toolkit/utils'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { handleTool, TOOLS } from './mcp/index'

const MCP_PORT = is.dev ? 24817 : 24816
const SESSION_TTL_MS = 30 * 60 * 1000

type Session = {
  transport: StreamableHTTPServerTransport
  server: Server
  lastUsed: number
}

// ─── MCP Server Setup ────────────────────────────────────────────────────────

function createMcpServer(): Server {
  const server = new Server(
    { name: 'nonla-desk-miniapps', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await handleTool(name, args || {})
      return { content: [{ type: 'text' as const, text: result }] }
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }) }],
        isError: true,
      }
    }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'miniapp://guide/development',
        name: 'Mini App Development Guide',
        description: 'Complete guide for developing mini apps',
        mimeType: 'text/markdown',
      },
    ],
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === 'miniapp://guide/development') {
      const text = await handleTool('get_miniapp_guide', {})
      return {
        contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text }],
      }
    }
    throw new Error(`Unknown resource: ${request.params.uri}`)
  })

  return server
}

function localHostsForPort(port: number): string[] {
  return [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    '127.0.0.1',
    'localhost',
    '[::1]',
  ]
}

function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false
  return localHostsForPort(MCP_PORT).includes(host.toLowerCase())
}

/** Native MCP clients omit Origin. Browser pages always send it — reject non-loopback. */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  } catch {
    return false
  }
}

function jsonRpcError(
  res: ServerResponse,
  httpStatus: number,
  code: number,
  message: string,
): void {
  if (res.headersSent) return
  res.writeHead(httpStatus, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

function transportOptions(
  onsessioninitialized?: (sessionId: string) => void,
): ConstructorParameters<typeof StreamableHTTPServerTransport>[0] {
  return {
    sessionIdGenerator: () => randomUUID(),
    enableDnsRebindingProtection: true,
    allowedHosts: localHostsForPort(MCP_PORT),
    onsessioninitialized,
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

let httpServers: ReturnType<typeof createServer>[] = []
const sessions = new Map<string, Session>()
const listeningHosts = new Set<string>()
let sessionSweeper: ReturnType<typeof setInterval> | undefined

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isLocalHostHeader(req.headers.host)) {
    jsonRpcError(res, 403, -32000, 'Forbidden host')
    return
  }

  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin)) {
    jsonRpcError(res, 403, -32000, 'Forbidden origin')
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(403)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${MCP_PORT}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({ status: 'ok', server: 'nonla-desk-miniapps', sessions: sessions.size }),
    )
    return
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!
    session.lastUsed = Date.now()
    try {
      await session.transport.handleRequest(req, res)
    } catch (e: any) {
      console.error('[mcp] Session request failed:', e)
      jsonRpcError(res, 500, -32603, e?.message || 'Internal error')
    }
    return
  }

  if (!sessionId && req.method === 'POST') {
    try {
      const pending: {
        transport?: StreamableHTTPServerTransport
        server?: Server
      } = {}

      const attach = (sid: string): void => {
        const { transport, server } = pending
        if (!transport || !server || sessions.has(sid)) return
        sessions.set(sid, { transport, server, lastUsed: Date.now() })
        transport.onclose = () => {
          sessions.delete(sid)
          void server.close()
        }
      }

      pending.transport = new StreamableHTTPServerTransport(transportOptions(attach))
      pending.server = createMcpServer()
      await pending.server.connect(pending.transport)
      await pending.transport.handleRequest(req, res)

      const sid = pending.transport.sessionId
      if (sid) attach(sid)
    } catch (e: any) {
      console.error('[mcp] Failed to create session:', e)
      jsonRpcError(res, 500, -32603, e?.message || 'Failed to create session')
    }
    return
  }

  if (sessionId) {
    jsonRpcError(res, 404, -32001, 'Session not found')
  } else {
    jsonRpcError(res, 400, -32600, 'Bad request')
  }
}

function listenWithRetry(host: string): ReturnType<typeof createServer> {
  const server = createServer((req, res) => {
    void handleMcpRequest(req, res)
  })
  const maxAttempts = 20
  let attempts = 0
  const label = host.includes(':') ? `[${host}]` : host

  const start = (): void => {
    server.listen(MCP_PORT, host, () => {
      listeningHosts.add(host)
      console.log(`[mcp] Mini App MCP server listening on http://${label}:${MCP_PORT}/mcp`)
    })
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
      attempts++
      console.warn(
        `[mcp] Port ${MCP_PORT} (${host}) in use, retrying (${attempts}/${maxAttempts})...`,
      )
      setTimeout(start, 250)
      return
    }
    if (err.code === 'EADDRINUSE') {
      console.warn(`[mcp] Port ${MCP_PORT} (${host}) still in use, MCP server not started`)
      return
    }
    if (err.code === 'EADDRNOTAVAIL') {
      console.warn(`[mcp] Host ${host} not available, skipped`)
      return
    }
    console.error('[mcp] MCP server error:', err)
  })

  start()
  return server
}

function startSessionSweeper(): void {
  if (sessionSweeper) return
  sessionSweeper = setInterval(() => {
    const now = Date.now()
    for (const [sid, session] of sessions) {
      if (now - session.lastUsed <= SESSION_TTL_MS) continue
      session.transport.onclose = undefined
      void session.transport.close()
      void session.server.close()
      sessions.delete(sid)
    }
  }, 60_000)
  sessionSweeper.unref?.()
}

export function getMcpInfo(): { port: number; url: string; listening: boolean } {
  return {
    port: MCP_PORT,
    url: `http://127.0.0.1:${MCP_PORT}/mcp`,
    listening: listeningHosts.size > 0,
  }
}

export function startMcpServer(): void {
  stopMcpServer()
  httpServers = ['127.0.0.1', '::1'].map((host) => listenWithRetry(host))
  startSessionSweeper()
}

export function stopMcpServer(): void {
  if (sessionSweeper) {
    clearInterval(sessionSweeper)
    sessionSweeper = undefined
  }

  // Detach onclose handlers before closing to prevent infinite recursion
  // (transport.close → onclose → server.close → transport.close → ∞)
  for (const session of sessions.values()) {
    session.transport.onclose = undefined
    void session.transport.close()
    void session.server.close()
  }
  sessions.clear()
  listeningHosts.clear()

  for (const server of httpServers) {
    server.close()
  }
  if (httpServers.length > 0) {
    httpServers = []
    console.log('[mcp] MCP server stopped')
  }
}
