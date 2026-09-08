import { createMiniApp, findMiniAppByName } from '../mini-app-runtime'
import { CODE_PATH_PROPERTIES, pathsPayload, resolveCodeFields } from './code-files'
import { fail, ok } from './result'
import { MUTATING, type ToolModule } from './types'

export const createMiniappTool: ToolModule = {
  definition: {
    name: 'create_miniapp',
    description:
      'Create a new mini app. Fails if this name already exists — then use edit_miniapp_file (small changes) or write_miniapp_file (full rewrite) with that id. Prefer frontendPath (IDE writes a file, then pass the absolute path) over inlining frontendCode — large JSX in JSON often breaks escaping. Disabled by default on create. After saving, call check_miniapp with the returned id, then toggle_miniapp({ id, enabled: true }).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'App name — unique. Fails if a mini app with this name already exists.',
        },
        description: { type: 'string', description: 'Short description' },
        icon: {
          type: 'string',
          description: 'Fluent emoji or icon name (e.g. 🔑, Key, Palette, StickyNote)',
        },
        category: { type: 'string', description: 'Category: Dev Tools, Productivity, etc.' },
        version: { type: 'string', description: 'Version string' },
        ...CODE_PATH_PROPERTIES,
        frontendCode: {
          type: 'string',
          description: 'Fallback only. Prefer frontendPath. Full frontend source as a JSON string.',
        },
        backendCode: { type: 'string', description: 'Fallback only. Prefer backendPath.' },
        panelCode: { type: 'string', description: 'Fallback only. Prefer panelPath.' },
      },
      required: ['name'],
    },
    annotations: MUTATING,
  },

  handler: async (args: any) => {
    const code = resolveCodeFields(args)

    if (!code.frontendCode?.trim()) {
      fail('Provide frontendPath (preferred) or frontendCode.')
    }

    const existing = findMiniAppByName(args.name)
    if (existing) {
      fail(
        `A mini app named "${existing.name}" already exists (id: ${existing.id}). Use edit_miniapp_file or write_miniapp_file with that id — create_miniapp does not overwrite.`,
      )
    }

    const app = createMiniApp({
      name: args.name,
      description: args.description,
      icon: args.icon,
      category: args.category,
      version: args.version,
      ...code,
    })
    return ok({
      success: true,
      message: `Created "${app.name}" (id: ${app.id}). DISABLED by default. Call check_miniapp({ id: "${app.id}" }) then toggle_miniapp({ id: "${app.id}", enabled: true }). Next edits: edit_miniapp_file for small changes, write_miniapp_file to rewrite a file.`,
      id: app.id,
      name: app.name,
      enabled: false,
      paths: pathsPayload(app.id),
    })
  },
}
