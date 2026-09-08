import { transform } from 'sucrase'
import { getMiniApp, readAppCode } from '../mini-app-runtime'
import { CODE_PATH_PROPERTIES, resolveCodeFields } from './code-files'
import { fail, ok } from './result'
import { READ_ONLY, type ToolModule } from './types'

type FileKind = 'frontend' | 'backend' | 'panel'

interface FileResult {
  file: FileKind
  ok: boolean
  errors: string[]
}

const BANNED_PATTERNS = [
  { pattern: /\bctx\.h\s*\(/, label: 'ctx.h()' },
  { pattern: /\bReact\.createElement\s*\(/, label: 'React.createElement()' },
  { pattern: /(?:^|[^a-zA-Z0-9_$.])h\s*\(/, label: 'h()' },
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function transpileJsx(code: string): string {
  if (!/<[A-Za-z]/.test(code)) return code
  try {
    return transform(code, {
      transforms: ['jsx'],
      jsxPragma: '__jsx',
      jsxFragmentPragma: 'React.Fragment',
      production: true,
    }).code
  } catch (e: any) {
    throw new Error(`JSX syntax error: ${e?.message || String(e)}`)
  }
}

function hasModuleExport(source: string): boolean {
  const stripped = stripComments(source)
  return /module\.exports\s*=/.test(stripped) || /exports\.default\s*=/.test(stripped)
}

function exportsPrimitive(source: string): boolean {
  const stripped = stripComments(source)
  return /module\.exports\s*=\s*(['"`]|[-+]?\d|null\b|true\b|false\b)/.test(stripped)
}

function checkSyntax(transpiled: string): void {
  // Compile only — never invoke. Calling the factory would run user code in Electron main.
  const wrapped = `(function(module, exports, ctx, __jsx, React, require) {\n${transpiled}\n})`
  new Function(`"use strict"; return ${wrapped}`)
}

function checkFile(kind: FileKind, code: string | null | undefined): FileResult {
  const errors: string[] = []
  const source = (code ?? '').trim()

  if (!source) {
    if (kind === 'frontend') {
      errors.push('frontendCode is empty — a mini app must export a React component.')
    }
    return { file: kind, ok: errors.length === 0, errors }
  }

  if (/\bimport\s/.test(source) || /\bexport\s/.test(source)) {
    errors.push('Do not use import/export. Use module.exports = function ...')
  }

  if (kind !== 'backend') {
    for (const { pattern, label } of BANNED_PATTERNS) {
      if (pattern.test(source)) {
        errors.push(`Banned ${label}. Use JSX, e.g. return (<div className="p-6">Hello</div>)`)
      }
    }
  }

  let transpiled = source
  if (kind !== 'backend') {
    try {
      transpiled = transpileJsx(source)
    } catch (e: any) {
      errors.push(e.message)
      return { file: kind, ok: false, errors }
    }
  }

  try {
    checkSyntax(transpiled)
  } catch (e: any) {
    errors.push(`Syntax error: ${e?.message || String(e)}`)
  }

  if (!hasModuleExport(source)) {
    errors.push(
      'module.exports must be assigned. Example: module.exports = function MyApp({ ctx }) { ... }',
    )
  } else if (exportsPrimitive(source)) {
    errors.push('module.exports must be a function, not a primitive.')
  }

  return { file: kind, ok: errors.length === 0, errors }
}

export const checkMiniappTool: ToolModule = {
  definition: {
    name: 'check_miniapp',
    description:
      'Dry-run a mini app: transpile JSX, catch syntax errors, and verify module.exports is assigned. Does not execute app code, render UI, or start the backend process. Pass id to check a saved app, or pass code/path fields to check unsaved source. Call after create_miniapp, edit_miniapp_file, or write_miniapp_file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Saved mini app ID (optional if code is provided)' },
        ...CODE_PATH_PROPERTIES,
        frontendCode: { type: 'string', description: 'Override / unsaved frontend source' },
        backendCode: { type: 'string', description: 'Override / unsaved backend source' },
        panelCode: { type: 'string', description: 'Override / unsaved panel source' },
      },
      required: [] as string[],
    },
    annotations: READ_ONLY,
  },

  handler: async (args: any) => {
    const fromPath = resolveCodeFields(args)
    let frontendCode = (fromPath.frontendCode ?? args.frontendCode) as string | undefined
    let backendCode = (fromPath.backendCode ?? args.backendCode) as string | undefined
    let panelCode = (fromPath.panelCode ?? args.panelCode) as string | undefined
    let name: string | undefined

    if (args.id) {
      const app = getMiniApp(args.id)
      if (!app) fail(`Mini app "${args.id}" not found`)
      name = app.name
      const saved = readAppCode(app.id)
      if (frontendCode === undefined) frontendCode = saved.frontendCode
      if (backendCode === undefined) backendCode = saved.backendCode
      if (panelCode === undefined) panelCode = saved.panelCode ?? undefined
    } else if (frontendCode === undefined && backendCode === undefined && panelCode === undefined) {
      fail('Provide id, or frontendPath / frontendCode / backendCode / panelCode to check.')
    }

    const files = [
      checkFile('frontend', frontendCode),
      ...(backendCode?.trim() ? [checkFile('backend', backendCode)] : []),
      ...(panelCode?.trim() ? [checkFile('panel', panelCode)] : []),
    ]

    const passed = files.every((f) => f.ok)
    return ok({
      ok: passed,
      id: args.id || null,
      name: name || null,
      message: passed
        ? 'No syntax errors. This check does not execute the app — open it in Nonla Desk to catch render-time issues.'
        : 'Found errors — fix these before enabling the app.',
      files,
    })
  },
}
