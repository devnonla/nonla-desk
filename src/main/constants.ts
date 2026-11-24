export const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
}

export const FALLBACK_MODELS: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: 'gpt-4.1', name: 'gpt-4.1' },
    { id: 'gpt-4o', name: 'gpt-4o' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
    { id: 'claude-opus-4-1', name: 'claude-opus-4-1' },
    { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
    { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4.5', name: 'anthropic/claude-sonnet-4.5' },
    { id: 'openai/gpt-4.1', name: 'openai/gpt-4.1' },
  ],
  custom: [],
}
