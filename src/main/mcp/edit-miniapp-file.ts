import { getMiniApp } from '../mini-app-runtime'
import {
  applyReplace,
  editedPayload,
  FILE_KIND_PROPERTY,
  parseFileKind,
  readFileSource,
  saveMiniappFile,
} from './miniapp-files'
import { fail, ok } from './result'
import { MUTATING, type ToolModule } from './types'

export const editMiniappFileTool: ToolModule = {
  definition: {
    name: 'edit_miniapp_file',
    description:
      "Surgically edit one mini app file — like Cursor's StrReplace. Pass the exact existing text (old_string) and its replacement (new_string). old_string must match exactly, including whitespace, and must be unique unless replace_all is true. Fails without writing if not found or not unique. Cannot create files — use write_miniapp_file for that. Auto-disables the app. Call check_miniapp after, then toggle_miniapp({ id, enabled: true }).",
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Mini app ID' },
        file: FILE_KIND_PROPERTY,
        old_string: {
          type: 'string',
          description:
            'Exact text to find, including indentation and line breaks. Must not be empty.',
        },
        new_string: { type: 'string', description: 'Replacement text (literal, not a regex).' },
        replace_all: {
          type: 'boolean',
          description:
            'Replace every occurrence instead of requiring exactly one match. Default false.',
        },
      },
      required: ['id', 'file', 'old_string', 'new_string'],
    },
    annotations: MUTATING,
  },

  handler: async (args: any) => {
    const id = args.id as string
    const file = parseFileKind(args.file)
    if (!file) {
      fail('file must be one of: frontend, backend, panel')
    }

    const oldString = typeof args.old_string === 'string' ? args.old_string : ''
    const newString = typeof args.new_string === 'string' ? args.new_string : ''
    if (!oldString) {
      fail(
        'old_string must not be empty. Use write_miniapp_file to create or fully overwrite this file.',
      )
    }
    if (oldString === newString) {
      fail('new_string is identical to old_string — no change.')
    }

    const app = getMiniApp(id)
    if (!app) fail(`Mini app "${id}" not found`)

    const current = readFileSource(id, file)
    if (!current) {
      fail(
        `${file} is empty or does not exist yet — nothing to match against. Use write_miniapp_file to create it.`,
      )
    }

    const result = applyReplace(current, oldString, newString, !!args.replace_all)
    if (!result.ok) {
      if (result.error === 'not-found') {
        fail(
          `old_string not found in ${file}. No changes were made. Re-read with get_miniapp({ id, file: "${file}" }) and copy text verbatim — including whitespace and line endings.`,
        )
      }
      const n = result.error.split(':')[1]
      fail(
        `old_string matched ${n} times in ${file} — not unique. Add more surrounding context, or pass replace_all: true.`,
      )
    }

    await saveMiniappFile(id, file, result.content)
    return ok(
      editedPayload(id, file, {
        replacements: result.replacements,
        autoDisabled: true,
        enabled: false,
        message: `Edited ${file} (${result.replacements} replacement${result.replacements === 1 ? '' : 's'}). App auto-disabled. Call check_miniapp({ id: "${id}" }) then toggle_miniapp({ id: "${id}", enabled: true }).`,
      }),
    )
  },
}
