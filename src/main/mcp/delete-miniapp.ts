import { deleteMiniApp, getMiniApp } from '../mini-app-runtime'
import { fail, ok } from './result'
import { DESTRUCTIVE, type ToolModule } from './types'

export const deleteMiniappTool: ToolModule = {
  definition: {
    name: 'delete_miniapp',
    description:
      'Permanently delete a mini app and its stored data. Irreversible. Pass confirm: true. Returns the deleted name/id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        confirm: {
          type: 'boolean',
          description: 'Must be true to actually delete.',
        },
      },
      required: ['id', 'confirm'],
    },
    annotations: DESTRUCTIVE,
  },

  handler: async (args: any) => {
    const existing = getMiniApp(args.id)
    if (!existing) fail(`Mini app "${args.id}" not found`)
    if (args.confirm !== true) {
      fail(
        `Pass confirm: true to permanently delete "${existing.name}" (id: ${existing.id}). This cannot be undone.`,
      )
    }

    const deleted = await deleteMiniApp(args.id)
    if (!deleted) fail(`Mini app "${args.id}" not found`)
    return ok({
      success: true,
      id: existing.id,
      name: existing.name,
      message: `Deleted "${existing.name}".`,
    })
  },
}
