import { getMiniApp, readAppCode } from '../mini-app-runtime'
import { fileFlags, pathsPayload } from './code-files'
import { CODE_FIELD, FILE_KIND_PROPERTY, parseFileKind } from './miniapp-files'
import { fail, ok } from './result'
import { READ_ONLY, type ToolModule } from './types'

export const getMiniappTool: ToolModule = {
  definition: {
    name: 'get_miniapp',
    description:
      'Get one mini app by id. Returns metadata and filesystem paths. Pass file to inline that one source file (use this before edit_miniapp_file so old_string is copied verbatim). Pass includeCode: true to inline all three files. Call only when you need this app and do not already have it from an earlier turn.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        file: {
          ...FILE_KIND_PROPERTY,
          description:
            "Return this one file's source. Implies includeCode for that file only. Use before edit_miniapp_file.",
        },
        includeCode: {
          type: 'boolean',
          description:
            'If true, also inline frontendCode / backendCode / panelCode (large). Default false. Ignored when file is set — then only that file is inlined.',
        },
      },
      required: ['id'],
    },
    annotations: READ_ONLY,
  },

  handler: async (args: any) => {
    const app = getMiniApp(args.id)
    if (!app) fail(`Mini app "${args.id}" not found`)
    const paths = pathsPayload(app.id)
    const payload: Record<string, unknown> = {
      id: app.id,
      name: app.name,
      description: app.description,
      icon: app.icon,
      category: app.category,
      version: app.version,
      enabled: !!app.enabled,
      ...fileFlags(app.id),
      paths,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
    }

    const file = args.file !== undefined ? parseFileKind(args.file) : null
    if (args.file !== undefined && !file) {
      fail('file must be one of: frontend, backend, panel')
    }

    if (file || args.includeCode) {
      const code = readAppCode(app.id)
      if (file) {
        payload[CODE_FIELD[file]] = code[CODE_FIELD[file]]
      } else {
        payload.frontendCode = code.frontendCode
        payload.backendCode = code.backendCode
        payload.panelCode = code.panelCode
      }
    }
    return ok(payload)
  },
}
