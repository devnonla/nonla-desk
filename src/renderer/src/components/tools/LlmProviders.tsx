import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { toast } from '../ui/Toast'

interface ModelInfo {
  id: string
  name: string
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom' },
]

export default function LlmProviders() {
  const [providerId, setProviderId] = useState('')
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [keyPlaceholder, setKeyPlaceholder] = useState('sk-...')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [listRes, assistant] = await Promise.all([
        window.api?.listLlmProviders(),
        window.api?.getAssistant(),
      ])
      const saved = listRes?.success ? listRes.providers?.[0] : null
      if (saved) {
        setProviderId(saved.id)
        setProvider(saved.provider || 'openai')
        setEndpoint(saved.endpoint || '')
        setKeyPlaceholder(saved.apiKey || 'sk-...')
        setHasSavedKey(true)
        setModels(saved.models || [])
        const nextModel =
          assistant?.model && saved.models?.some((m: ModelInfo) => m.id === assistant.model)
            ? assistant.model
            : saved.models?.[0]?.id || ''
        setModel(nextModel)
        if (saved.id && nextModel && assistant?.model !== nextModel) {
          void window.api?.setAssistantModel({ providerId: saved.id, model: nextModel })
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isValid =
    Boolean(provider) &&
    (apiKey.trim() || hasSavedKey) &&
    (provider !== 'custom' || endpoint.trim())

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await window.api?.addLlmProvider({
        provider,
        apiKey: apiKey.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
      })
      if (!res?.success) {
        setError(res?.error || 'Failed to save provider')
        return
      }

      const nextModels: ModelInfo[] = res.models || []
      const nextModel = nextModels.some((m) => m.id === model) ? model : nextModels[0]?.id || ''
      setProviderId(res.id || '')
      setModels(nextModels)
      setModel(nextModel)
      setHasSavedKey(true)
      setApiKey('')
      if (res.id && nextModel) {
        await window.api?.setAssistantModel({ providerId: res.id, model: nextModel })
      }
      toast.success('Provider saved')
      await load()
    } catch (err: any) {
      setError(err.message || 'Unexpected error')
    } finally {
      setSaving(false)
    }
  }

  const onModelChange = async (id: string) => {
    setModel(id)
    if (!providerId) return
    const res = await window.api?.setAssistantModel({ providerId, model: id })
    if (!res?.success) toast.error(res?.error || 'Failed to save model')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-(--color-mute)">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-(--color-ink) mb-1">LLM Provider</h3>
      <p className="text-[13px] leading-5 text-(--color-body) mb-4 max-w-140">
        The Agent app uses this key to write mini apps. MCP for Cursor and Claude Code is separate.
      </p>
      <div className="border border-(--color-hairline) rounded-lg bg-(--color-canvas-soft) p-4 flex flex-col gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[1.5px] text-(--color-mute) mb-1.5">
            Provider
          </span>
          <Select
            value={provider}
            onChange={setProvider}
            options={PROVIDER_OPTIONS}
            className="w-full"
            size="middle"
          />
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[1.5px] text-(--color-mute) mb-1.5">
            API Key
          </span>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyPlaceholder}
              className="pr-9 font-mono"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink)"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {provider === 'custom' && (
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[1.5px] text-(--color-mute) mb-1.5">
              Endpoint
            </span>
            <Input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://your-api.com/v1"
              className="font-mono"
            />
          </div>
        )}

        {models.length > 0 && (
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[1.5px] text-(--color-mute) mb-1.5">
              Model
            </span>
            <Select
              value={model}
              onChange={onModelChange}
              options={models.map((m) => ({ value: m.id, label: m.id }))}
              showSearch
              className="w-full"
              size="middle"
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-(--color-error)/10 border border-(--color-error)/20">
            <AlertCircle size={14} className="text-(--color-error) shrink-0 mt-0.5" />
            <span className="text-xs text-(--color-error) leading-relaxed">{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="primary"
            size="small"
            onClick={handleSave}
            disabled={!isValid}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
