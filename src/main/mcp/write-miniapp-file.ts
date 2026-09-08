import { getMiniApp } from '../mini-app-runtime'
import { readCodeFile } from './code-files'
import {
  editedPayload,
  FILE_KIND_PROPERTY,
  parseFileKind,
  readFileSource,
  saveMiniappFile,
} from './miniapp-files'
import { fail, ok } from './result'
import { MUTATING, type ToolModule } from './types'

export const writeMiniappFileTool: ToolModule = {
  definition: {
    name: 'write_miniapp_file',
    description:
      "Overwrite one mini app file with full contents — like Cursor's Write. Use for a new file (first backend/panel) or a complete rewrite. For small changes to existing code, use edit_miniapp_file instead. Prefer path over content for large files (avoids JSON escaping). Auto-disables the app. Call check_miniapp after, then toggle_miniapp({ id, enabled: true }).",
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        file: FILE_KIND_PROPERTY,
        content: {
          type: 'string',
          description:
            'Full file contents. Empty string clears backend/panel (not frontend). Prefer path for large JSX.',
        },
        path: {
          type: 'string',
          description:
            'Absolute path to a JS/JSX file to copy in (wins over content). Use this if you wrote the file with the IDE, including the app dir path itself to sync an in-place edit.',
        },
      },
      required: ['id', 'file'],
    },
    annotations: MUTATING,
  },

  handler: async (args: any) => {
    const id = args.id as string
    const file = parseFileKind(args.file)
    if (!file) {
      fail('file must be one of: frontend, backend, panel')
    }

    const app = getMiniApp(id)
    if (!app) fail(`Mini app "${id}" not found`)

    let content: string
    if (args.path) {
      content = readCodeFile(args.path, 'path')
    } else if (args.content !== undefined) {
      content = String(args.content)
    } else {
      fail('Provide content, or path to a file to copy in.')
    }

    if (file === 'frontend' && !content.trim()) {
      fail('frontend cannot be empty. A mini app must export a React component.')
    }

    const existed = readFileSource(id, file).trim().length > 0
    await saveMiniappFile(id, file, content)
    return ok(
      editedPayload(id, file, {
        created: !existed,
        autoDisabled: true,
        enabled: false,
        message: `${existed ? 'Overwrote' : 'Created'} ${file}. App auto-disabled. Call check_miniapp({ id: "${id}" }) then toggle_miniapp({ id: "${id}", enabled: true }).`,
      }),
    )
  },
}
