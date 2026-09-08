import { getMiniApp, setMiniAppEnabled } from '../mini-app-runtime'
import { fail, ok } from './result'
import { MUTATING, type ToolModule } from './types'

export const toggleMiniappTool: ToolModule = {
  definition: {
    name: 'toggle_miniapp',
    description:
      'Enable or disable a mini app. Pass enabled: true or false (required) — this is a set, not a flip. If enabling fails because required config is missing, the error lists those keys.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        enabled: {
          type: 'boolean',
          description: 'Desired state. true = enable, false = disable. Required.',
        },
      },
      required: ['id', 'enabled'],
    },
    annotations: MUTATING,
  },

  handler: async (args: any) => {
    if (typeof args.enabled !== 'boolean') {
      fail('enabled is required (true to enable, false to disable). This tool does not flip.')
    }

    const existing = getMiniApp(args.id)
    if (!existing) fail(`Mini app "${args.id}" not found`)

    const result = await setMiniAppEnabled(args.id, args.enabled)
    if (result.missingConfigs?.length) {
      fail(
        `Cannot enable "${existing.name}": missing required config (${result.missingConfigs.join(', ')}). Fill these in the Nonla Desk dashboard, then retry.`,
      )
    }
    if (!result.app) fail(`Mini app "${args.id}" not found`)

    const already = !!existing.enabled === args.enabled
    return ok({
      success: true,
      enabled: !!result.app.enabled,
      message: already
        ? `"${result.app.name}" is already ${result.app.enabled ? 'ENABLED' : 'DISABLED'}.`
        : `"${result.app.name}" is now ${result.app.enabled ? 'ENABLED' : 'DISABLED'}.`,
    })
  },
}
