import { randomUUID } from 'node:crypto'
import { ChatAnthropic } from '@langchain/anthropic'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import { PROVIDER_ENDPOINTS } from './constants'
import { getSqlite } from './db'
import { getLlmProvider } from './llm-providers'
import { handleTool, TOOLS } from './mcp'
import type { ToolDefinition } from './mcp/types'

const KEY_MESSAGES = 'assistant.messages'
const KEY_PROVIDER = 'assistant.providerId'
const KEY_MODEL = 'assistant.model'

const SYSTEM_PROMPT = `You are the Nonla Desk agent. You write and manage mini apps inside this desktop app.

You can create, read, edit, enable/disable, and delete mini apps using your tools.

Rules:
- Call get_miniapp_guide BEFORE writing or changing any mini app code. Use the v3 guide; do not reuse an older copy.
- Call list_miniapps / get_miniapp when editing or discussing an existing app.
- App names are unique. Never clone ("Todo 2"). Edit the existing id.
- Small change → edit_miniapp_file. New file or full rewrite → write_miniapp_file. Metadata only → update_miniapp.
- You run inside Nonla Desk, not an IDE. Pass frontendCode / content directly. Do not use frontendPath or path unless you actually wrote that file on disk.
- New apps are created DISABLED. After saving, call check_miniapp, then toggle_miniapp({ id, enabled: true }) if the user wants it on.
- Frontend MUST use \`module.exports = function Name({ ctx })\` with JSX. No import/export.
- Use ctx.ui.Space for every row/stack. Root padding p-6. Colors as text-(--color-ink), never hardcoded hex.
- Keep replies short. After creating or updating an app, say the name and what changed.
- Reply in the user's language.`

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantEvent {
  requestId: string
  type: 'token' | 'tool' | 'done' | 'error'
  text?: string
  tool?: { name: string; status: 'start' | 'end'; output?: string }
  error?: string
}

let abortController: AbortController | null = null

function parseMessages(raw: string): StoredMessage[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readConfig(key: string): string {
  const row = getSqlite().prepare('SELECT value FROM configurations WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

function writeConfig(key: string, value: string) {
  getSqlite()
    .prepare(
      `INSERT INTO configurations (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value)
}

function chunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return ''
  const c = chunk as { content?: unknown; text?: unknown }
  if (typeof c.text === 'string' && c.text) return c.text
  const content = c.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text || '')
        }
        return ''
      })
      .join('')
  }
  return ''
}

function toolOutputText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const obj = raw as { content?: unknown }
    if (typeof obj.content === 'string') return obj.content
  }
  if (raw != null) return JSON.stringify(raw)
  return ''
}

function schemaFor(def: ToolDefinition) {
  const properties = def.inputSchema.properties || {}
  const required = new Set(def.inputSchema.required || [])
  if (Object.keys(properties).length === 0) {
    return z.object({})
  }
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, raw] of Object.entries(properties)) {
    const prop = raw as { type?: string; description?: string }
    let field: z.ZodTypeAny
    switch (prop.type) {
      case 'boolean':
        field = z.boolean()
        break
      case 'number':
      case 'integer':
        field = z.number()
        break
      case 'array':
        field = z.array(z.any())
        break
      case 'object':
        field = z.record(z.string(), z.any())
        break
      default:
        field = z.string()
    }
    if (prop.description) field = field.describe(prop.description)
    if (!required.has(key)) field = field.optional()
    shape[key] = field
  }
  return z.object(shape)
}

function buildTools() {
  return TOOLS.map((def) =>
    tool(
      async (input) => {
        try {
          return await handleTool(def.name, input ?? {})
        } catch (err: any) {
          return JSON.stringify({ error: err.message || String(err) })
        }
      },
      {
        name: def.name,
        description: def.description,
        schema: schemaFor(def),
      },
    ),
  )
}

function stripTrailingV1(url: string): string {
  return url.replace(/\/v1\/?$/, '')
}

function createChatModel(row: {
  provider: string
  apiKey: string
  endpoint: string | null
  model: string
}) {
  const endpoint = row.endpoint || PROVIDER_ENDPOINTS[row.provider] || undefined

  if (row.provider === 'anthropic') {
    return new ChatAnthropic({
      model: row.model,
      apiKey: row.apiKey,
      temperature: 0.2,
      anthropicApiUrl: endpoint ? stripTrailingV1(endpoint) : undefined,
    })
  }

  if (row.provider === 'google') {
    return new ChatGoogleGenerativeAI({
      model: row.model,
      apiKey: row.apiKey,
      temperature: 0.2,
    })
  }

  return new ChatOpenAI({
    model: row.model,
    apiKey: row.apiKey,
    temperature: 0.2,
    configuration: {
      baseURL: endpoint,
      defaultHeaders:
        row.provider === 'openrouter'
          ? {
              'HTTP-Referer': 'https://github.com/devnonla/nonla-desk',
              'X-Title': 'Nonla Desk',
            }
          : undefined,
    },
  })
}

function emit(sender: WebContents, event: AssistantEvent) {
  if (sender.isDestroyed()) return
  sender.send('assistant:event', event)
}

export function setupAgentIPC() {
  ipcMain.handle('assistant:get', () => {
    try {
      return {
        success: true,
        providerId: readConfig(KEY_PROVIDER) || null,
        model: readConfig(KEY_MODEL) || null,
        messages: parseMessages(readConfig(KEY_MESSAGES)),
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('assistant:set-model', (_event, data: { providerId: string; model: string }) => {
    try {
      const providerId = data.providerId?.trim()
      const model = data.model?.trim()
      if (!providerId) throw new Error('Provider is required')
      if (!model) throw new Error('Model is required')
      if (!getLlmProvider(providerId)) throw new Error('Provider not found')
      writeConfig(KEY_PROVIDER, providerId)
      writeConfig(KEY_MODEL, model)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('assistant:clear', () => {
    try {
      abortController?.abort()
      abortController = null
      writeConfig(KEY_MESSAGES, '[]')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('assistant:abort', () => {
    abortController?.abort()
    abortController = null
    return { success: true }
  })

  ipcMain.handle('assistant:chat', async (event, message: string) => {
    const requestId = randomUUID()
    const sender = event.sender

    try {
      const text = message?.trim()
      if (!text) throw new Error('Message is required')

      const providerId = readConfig(KEY_PROVIDER)
      const model = readConfig(KEY_MODEL)
      if (!providerId || !model) {
        throw new Error('Pick a provider and model first')
      }

      const provider = getLlmProvider(providerId)
      if (!provider) throw new Error('Add an LLM provider in Settings first.')

      abortController?.abort()
      const controller = new AbortController()
      abortController = controller

      const history = parseMessages(readConfig(KEY_MESSAGES))
      const llm = createChatModel({
        provider: provider.provider,
        apiKey: provider.api_key,
        endpoint: provider.endpoint,
        model,
      })

      const graph = createReactAgent({
        llm,
        tools: buildTools(),
        prompt: SYSTEM_PROMPT,
      })

      const inputMessages = [
        ...history.map((m) =>
          m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
        ),
        new HumanMessage(text),
      ]

      let assistant = ''

      const stream = graph.streamEvents(
        { messages: inputMessages },
        { version: 'v2', signal: controller.signal, recursionLimit: 40 },
      )

      for await (const ev of stream) {
        if (controller.signal.aborted) break

        if (ev.event === 'on_chat_model_stream') {
          const token = chunkText(ev.data?.chunk)
          if (token) {
            assistant += token
            emit(sender, { requestId, type: 'token', text: token })
          }
        } else if (ev.event === 'on_tool_start') {
          emit(sender, {
            requestId,
            type: 'tool',
            tool: { name: ev.name || 'tool', status: 'start' },
          })
        } else if (ev.event === 'on_tool_end') {
          emit(sender, {
            requestId,
            type: 'tool',
            tool: {
              name: ev.name || 'tool',
              status: 'end',
              output: toolOutputText(ev.data?.output).slice(0, 4000),
            },
          })
        }
      }

      const next: StoredMessage[] = [...history, { role: 'user', content: text }]
      if (assistant.trim()) {
        next.push({ role: 'assistant', content: assistant })
      }
      writeConfig(KEY_MESSAGES, JSON.stringify(next))

      if (abortController === controller) abortController = null
      emit(sender, { requestId, type: 'done' })
      return { success: true, requestId, aborted: controller.signal.aborted }
    } catch (err: any) {
      abortController = null
      const aborted = err?.name === 'AbortError' || /abort/i.test(String(err?.message || ''))
      if (!aborted) {
        emit(sender, {
          requestId,
          type: 'error',
          error: err.message || 'Agent failed',
        })
      } else {
        emit(sender, { requestId, type: 'done' })
      }
      return { success: aborted, error: aborted ? undefined : err.message, requestId }
    }
  })
}
