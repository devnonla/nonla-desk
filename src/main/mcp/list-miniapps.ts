import { listMiniApps } from '../mini-app-runtime'
import { fileFlags, pathsPayload } from './code-files'
import { ok } from './result'
import { READ_ONLY, type ToolModule } from './types'

export const listMiniappsTool: ToolModule = {
  definition: {
    name: 'list_miniapps',
    description:
      'List installed mini apps (id, name, paths, flags — no source code). After listing, do not get_miniapp every app. If a name already exists, edit that id with edit_miniapp_file / write_miniapp_file — never create_miniapp a duplicate (create fails on name clash).',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    annotations: READ_ONLY,
  },

  handler: async () => {
    const apps = listMiniApps()
    return ok(
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        version: a.version,
        enabled: !!a.enabled,
        ...fileFlags(a.id),
        paths: pathsPayload(a.id),
      })),
    )
  },
}
