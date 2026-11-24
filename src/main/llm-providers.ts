import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { FALLBACK_MODELS, PROVIDER_ENDPOINTS } from './constants'
import { getSqlite } from './db'

export interface ModelInfo {
  id: string
  name: string
}

export interface LlmProviderRow {
  id: string
  name: string
  provider: string
  api_key: string
  endpoint: string | null
  models: string
}

function parseModels(raw: string): ModelInfo[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function maskKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

function getProvider(id: string): LlmProviderRow | undefined {
  return getSqlite().prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as
    | LlmProviderRow
    | undefined
}

export function getLlmProvider(id: string): LlmProviderRow | undefined {
  return getProvider(id)
}

function listRows(): LlmProviderRow[] {
  return getSqlite()
    .prepare('SELECT * FROM llm_providers ORDER BY created_at ASC')
    .all() as LlmProviderRow[]
}

async function fetchModels(
  provider: string,
  apiKey: string,
  endpoint?: string,
): Promise<ModelInfo[]> {
  const fallback = FALLBACK_MODELS[provider] || []
  try {
    if (provider === 'anthropic') {
      const base = (endpoint || PROVIDER_ENDPOINTS.anthropic).replace(/\/v1\/?$/, '')
      const res = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (!res.ok) return fallback
      const data = (await res.json()) as { data?: { id: string }[] }
      const models = (data.data || []).map((m) => ({ id: m.id, name: m.id }))
      return models.length ? models : fallback
    }

    if (provider === 'google') {
      const base = endpoint || PROVIDER_ENDPOINTS.google
      const res = await fetch(`${base}/models?key=${encodeURIComponent(apiKey)}`)
      if (!res.ok) return fallback
      const data = (await res.json()) as { models?: { name: string }[] }
      const models = (data.models || [])
        .map((m) => {
          const id = (m.name || '').replace(/^models\//, '')
          return { id, name: id }
        })
        .filter((m) => m.id)
      return models.length ? models : fallback
    }

    const base = (endpoint || PROVIDER_ENDPOINTS[provider] || endpoint || '').replace(/\/$/, '')
    if (!base) return fallback
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return fallback
    const data = (await res.json()) as { data?: { id: string }[] }
    const models = (data.data || []).map((m) => ({ id: m.id, name: m.id }))
    return models.length ? models : fallback
  } catch {
    return fallback
  }
}

export function setupLlmProviderIPC() {
  ipcMain.handle('llm:list-providers', () => {
    try {
      const providers = listRows().map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        endpoint: row.endpoint || '',
        apiKey: maskKey(row.api_key),
        models: parseModels(row.models),
      }))
      return { success: true, providers }
    } catch (err: any) {
      return { success: false, error: err.message, providers: [] }
    }
  })

  ipcMain.handle(
    'llm:add-provider',
    async (
      _event,
      data: { name?: string; provider: string; apiKey?: string; endpoint?: string },
    ) => {
      try {
        const provider = data.provider?.trim()
        if (!provider) throw new Error('Provider is required')
        if (provider === 'custom' && !data.endpoint?.trim()) {
          throw new Error('Endpoint is required for a custom provider')
        }

        const existing = listRows()[0]
        const apiKey = data.apiKey?.trim() || existing?.api_key || ''
        if (!apiKey) throw new Error('API key is required')

        const endpoint = data.endpoint?.trim() || null
        const models = await fetchModels(provider, apiKey, endpoint || undefined)
        const now = new Date().toISOString()
        const id = existing?.id || randomUUID()
        const name = data.name?.trim() || provider

        if (existing) {
          getSqlite()
            .prepare(
              `UPDATE llm_providers
               SET name = ?, provider = ?, api_key = ?, endpoint = ?, models = ?, updated_at = ?
               WHERE id = ?`,
            )
            .run(name, provider, apiKey, endpoint, JSON.stringify(models), now, id)
        } else {
          getSqlite()
            .prepare(
              `INSERT INTO llm_providers
               (id, name, provider, api_key, endpoint, models, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(id, name, provider, apiKey, endpoint, JSON.stringify(models), now, now)
        }

        return { success: true, id, models }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    },
  )
}
