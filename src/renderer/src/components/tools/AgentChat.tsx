import type { ChatStatus } from 'ai'
import { CopyIcon, EraserIcon, ExternalLinkIcon, MessageSquareIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/shadcn/button'
import { Spinner } from '@/components/shadcn/spinner'
import { TooltipProvider } from '@/components/shadcn/tooltip'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '../ai-elements/prompt-input'
import { Shimmer } from '../ai-elements/shimmer'
import { Suggestion, Suggestions } from '../ai-elements/suggestion'
import { Tool, ToolContent, ToolHeader, ToolOutput } from '../ai-elements/tool'
import { confirm } from '../ui/ConfirmDialog'
import { toast } from '../ui/Toast'

interface LlmProvider {
  id: string
  name: string
  provider: string
  models: { id: string; name: string }[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  tools?: { name: string; status: 'start' | 'end'; output?: string }[]
}

interface AssistantEvent {
  requestId: string
  type: 'token' | 'tool' | 'done' | 'error'
  text?: string
  tool?: { name: string; status: 'start' | 'end'; output?: string }
  error?: string
}

const EXAMPLES = [
  'Make a JSON formatter',
  'Todo list with a tray panel',
  'List my mini apps',
  'A markdown previewer',
]

function parseAppId(output?: string): { id: string; name?: string } | null {
  if (!output) return null
  try {
    const data = JSON.parse(output)
    if (data?.id) return { id: data.id, name: data.name }
  } catch {
    const match = output.match(/"id"\s*:\s*"([^"]+)"/)
    if (match) return { id: match[1] }
  }
  return null
}

function parseToolOutput(output?: string) {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return output
  }
}

export default function AgentChat() {
  const navigate = useNavigate()
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)

  const selected = providers.find((p) => p.id === providerId)
  const canChat = Boolean(providerId && model)
  const lastMessage = messages[messages.length - 1]
  const showThinking = streaming && lastMessage?.role === 'user'
  const chatStatus: ChatStatus = streaming
    ? lastMessage?.role === 'assistant'
      ? 'streaming'
      : 'submitted'
    : 'ready'

  const load = useCallback(async () => {
    try {
      const [state, providerRes] = await Promise.all([
        window.api?.getAssistant(),
        window.api?.listLlmProviders(),
      ])
      const list = (providerRes?.providers || []) as LlmProvider[]
      setProviders(list)

      let nextProvider = state?.providerId || ''
      let nextModel = state?.model || ''
      if (nextProvider && !list.some((p) => p.id === nextProvider)) {
        nextProvider = ''
        nextModel = ''
      }
      if (!nextProvider && list[0]) {
        nextProvider = list[0].id
        nextModel = list[0].models[0]?.id || ''
        if (nextProvider && nextModel) {
          await window.api?.setAssistantModel({ providerId: nextProvider, model: nextModel })
        }
      }
      setProviderId(nextProvider)
      setModel(nextModel)
      setMessages((state?.messages || []) as ChatMessage[])
    } catch {
      toast.error('Failed to load agent')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const cleanup = window.api?.onAssistantEvent((event: AssistantEvent) => {
      if (event.type === 'token' && event.text) {
        const text = event.text
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + text }
          } else {
            next.push({ role: 'assistant', content: text, tools: [] })
          }
          return next
        })
      }

      if (event.type === 'tool' && event.tool) {
        const toolEvent = event.tool
        setMessages((prev) => {
          const next = [...prev]
          let last = next[next.length - 1]
          if (!last || last.role !== 'assistant') {
            next.push({ role: 'assistant', content: '', tools: [] })
            last = next[next.length - 1]
          }
          const tools = [...(last.tools || [])]
          if (toolEvent.status === 'start') {
            tools.push({ name: toolEvent.name, status: 'start' })
          } else {
            const idx = [...tools].reverse().findIndex((t) => t.name === toolEvent.name)
            const realIdx = idx === -1 ? -1 : tools.length - 1 - idx
            if (realIdx >= 0) {
              tools[realIdx] = {
                name: toolEvent.name,
                status: 'end',
                output: toolEvent.output,
              }
            } else {
              tools.push({
                name: toolEvent.name,
                status: 'end',
                output: toolEvent.output,
              })
            }
          }
          next[next.length - 1] = { ...last, tools }
          return next
        })
      }

      if (event.type === 'error') {
        setStreaming(false)
        toast.error(event.error || 'Agent failed')
      }

      if (event.type === 'done') {
        setStreaming(false)
      }
    })
    return () => cleanup?.()
  }, [])

  const persistModel = async (nextProviderId: string, nextModel: string) => {
    if (!nextProviderId || !nextModel) return
    await window.api?.setAssistantModel({ providerId: nextProviderId, model: nextModel })
  }

  const onProviderChange = (id: string) => {
    const provider = providers.find((p) => p.id === id)
    const nextModel = provider?.models[0]?.id || ''
    setProviderId(id)
    setModel(nextModel)
    void persistModel(id, nextModel)
  }

  const onModelChange = (id: string) => {
    setModel(id)
    void persistModel(providerId, id)
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming || !canChat) return
    setDraft('')
    setStreaming(true)
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    const res = await window.api?.chatAssistant(trimmed)
    if (!res?.success && res?.error) {
      setStreaming(false)
      toast.error(res.error)
    }
  }

  const handleSubmit = (message: PromptInputMessage) => {
    void send(message.text)
  }

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(index)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Could not copy')
    }
  }

  const clearChat = () => {
    confirm({
      title: 'Clear chat?',
      content: 'This removes the conversation with the agent.',
      okText: 'Clear',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await window.api?.clearAssistantChat()
        if (res?.success) {
          setMessages([])
          toast.success('Chat cleared')
        }
      },
    })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <Conversation>
          <ConversationContent>
            <ConversationEmptyState>
              <div className="text-muted-foreground">
                <MessageSquareIcon className="size-10" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium text-sm">Add an LLM provider first</h3>
                <p className="text-muted-foreground text-sm">
                  Endpoint and API key live in Settings. The agent uses those to write mini apps.
                </p>
              </div>
              <Button className="mt-2" onClick={() => navigate('/settings')}>
                Open Settings
              </Button>
            </ConversationEmptyState>
          </ConversationContent>
        </Conversation>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="relative flex size-full min-h-0 flex-col divide-y overflow-hidden bg-background">
        <Conversation>
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<MessageSquareIcon className="size-10" />}
                title="Mini-app agent"
                description="Ask it to create, edit, or manage mini apps. Try one of the prompts below."
              />
            ) : (
              messages.map((message, index) => (
                <Message from={message.role} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' &&
                    message.tools?.map((item, toolIndex) => {
                      const app =
                        item.status === 'end' &&
                        (item.name === 'create_miniapp' || item.name === 'write_miniapp_file')
                          ? parseAppId(item.output)
                          : null
                      return (
                        <Tool
                          defaultOpen={item.status === 'start'}
                          key={`${item.name}-${toolIndex}`}
                        >
                          <ToolHeader
                            state={item.status === 'start' ? 'input-available' : 'output-available'}
                            toolName={item.name}
                            type="dynamic-tool"
                          />
                          <ToolContent>
                            <ToolOutput
                              errorText={undefined}
                              output={
                                app ? (
                                  <div className="flex flex-col gap-3 p-3">
                                    <p className="text-sm">
                                      Saved {app.name || 'mini app'}. You can open it now.
                                    </p>
                                    <Button
                                      className="w-fit"
                                      onClick={() => navigate(`/mini/${app.id}`)}
                                      size="sm"
                                    >
                                      <ExternalLinkIcon className="size-4" />
                                      Open {app.name || 'app'}
                                    </Button>
                                  </div>
                                ) : (
                                  parseToolOutput(item.output)
                                )
                              }
                            />
                          </ToolContent>
                        </Tool>
                      )
                    })}
                  {(message.content || message.role === 'user') && (
                    <MessageContent className="group-[.is-user]:border group-[.is-user]:border-border">
                      {message.role === 'assistant' ? (
                        <MessageResponse isAnimating={streaming && index === messages.length - 1}>
                          {message.content}
                        </MessageResponse>
                      ) : (
                        message.content
                      )}
                    </MessageContent>
                  )}
                  {message.role === 'assistant' && message.content ? (
                    <MessageActions>
                      <MessageAction
                        label="Copy"
                        onClick={() => void copyMessage(message.content, index)}
                        tooltip={copied === index ? 'Copied' : 'Copy'}
                      >
                        <CopyIcon className="size-4" />
                      </MessageAction>
                    </MessageActions>
                  ) : null}
                </Message>
              ))
            )}
            {showThinking ? (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer className="text-sm" duration={1}>
                    Working
                  </Shimmer>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="grid shrink-0 gap-4 pt-4">
          <Suggestions className="px-4">
            {EXAMPLES.map((example) => (
              <Suggestion
                key={example}
                onClick={(value) => void send(value)}
                suggestion={example}
              />
            ))}
          </Suggestions>
          <div className="w-full px-4 pb-4">
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea
                  disabled={!canChat || streaming}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  placeholder="Create, edit, or manage a mini app…"
                  value={draft}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton
                    disabled={streaming || messages.length === 0}
                    onClick={clearChat}
                    tooltip="Clear chat"
                  >
                    <EraserIcon className="size-4" />
                  </PromptInputButton>
                  {providerId ? (
                    <PromptInputSelect
                      disabled={streaming}
                      onValueChange={onProviderChange}
                      value={providerId}
                    >
                      <PromptInputSelectTrigger>
                        <PromptInputSelectValue placeholder="Provider" />
                      </PromptInputSelectTrigger>
                      <PromptInputSelectContent>
                        {providers.map((provider) => (
                          <PromptInputSelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </PromptInputSelectItem>
                        ))}
                      </PromptInputSelectContent>
                    </PromptInputSelect>
                  ) : null}
                  {model ? (
                    <PromptInputSelect
                      disabled={streaming}
                      onValueChange={onModelChange}
                      value={model}
                    >
                      <PromptInputSelectTrigger>
                        <PromptInputSelectValue placeholder="Model" />
                      </PromptInputSelectTrigger>
                      <PromptInputSelectContent>
                        {(selected?.models || []).map((item) => (
                          <PromptInputSelectItem key={item.id} value={item.id}>
                            {item.id}
                          </PromptInputSelectItem>
                        ))}
                      </PromptInputSelectContent>
                    </PromptInputSelect>
                  ) : null}
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={!canChat || (!draft.trim() && chatStatus === 'ready')}
                  onStop={() => void window.api?.abortAssistant()}
                  status={chatStatus}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
