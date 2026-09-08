import { updateMiniApp } from '../mini-app-runtime'
import { fail, ok } from './result'
import { MUTATING, type ToolModule } from './types'

const MOVED_CODE_FIELDS = [
  'frontendCode',
  'backendCode',
  'panelCode',
  'frontendPath',
  'backendPath',
  'panelPath',
]

export const updateMiniappTool: ToolModule = {
  definition: {
    name: 'update_miniapp',
    description:
      'Update mini app metadata only (name, description, icon, category, version). Does not touch code. For surgical edits use edit_miniapp_file (like Cursor StrReplace). For a full file rewrite use write_miniapp_file (like Cursor Write).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        icon: { type: 'string' },
        category: { type: 'string' },
        version: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: MUTATING,
  },

  handler: async (args: any) => {
    const moved = MOVED_CODE_FIELDS.filter((k) => args[k] !== undefined)
    if (moved.length > 0) {
      fail(
        'Code updates moved. Use edit_miniapp_file for surgical edits (old_string/new_string) or write_miniapp_file for a full overwrite. update_miniapp only changes metadata.',
      )
    }

    const { id, name, description, icon, category, version } = args
    const data: Parameters<typeof updateMiniApp>[1] = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description
    if (icon !== undefined) data.icon = icon
    if (category !== undefined) data.category = category
    if (version !== undefined) data.version = version

    if (Object.keys(data).length === 0) {
      fail('No metadata fields to update.')
    }

    const app = await updateMiniApp(id, data)
    if (!app) fail(`Mini app "${id}" not found`)
    return ok({
      success: true,
      message: `Updated metadata for "${app.name}".`,
      id: app.id,
    })
  },
}
