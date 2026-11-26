/**
 * Static check behind `nonladesk check`: transpile with the same Sucrase setup the
 * renderer uses, compile (never run) the result, and verify module.exports.
 */
import { transpileCode } from './miniapp-helpers'

type FileKind = 'frontend' | 'backend' | 'panel'

export interface FileCheck {
  file: FileKind
  ok: boolean
  errors: string[]
}

export interface CheckResult {
  ok: boolean
  message: string
  files: FileCheck[]
}

const BANNED_PATTERNS = [
  { pattern: /\bctx\.h\s*\(/, label: 'ctx.h()' },
  { pattern: /\bReact\.createElement\s*\(/, label: 'React.createElement()' },
  { pattern: /(?:^|[^a-zA-Z0-9_$.])h\s*\(/, label: 'h()' },
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function checkFile(kind: FileKind, code: string | undefined): FileCheck {
  const errors: string[] = []
  const source = (code ?? '').trim()
  if (!source) {
    if (kind === 'frontend')
      errors.push('frontend is empty: a mini app must export a React component.')
    return { file: kind, ok: errors.length === 0, errors }
  }

  const stripped = stripComments(source)
  // Backends are plain CommonJS; frontends and panels may import libraries.
  if (kind === 'backend' && (/^\s*import\s/m.test(stripped) || /^\s*export\s/m.test(stripped))) {
    errors.push('Do not use import/export in the backend. Use module.exports = ... and require().')
  }
  if (
    kind !== 'backend' &&
    (/\bctx\.icons\b/.test(stripped) || /[{,]\s*icons\s*[,}][^=]*=\s*ctx\b/.test(stripped))
  ) {
    errors.push(
      'ctx.icons was removed. Use <ctx.ui.Icon name="copy" /> or draw the icon as an inline <svg> (see the Icons section of `nonladesk guide`).',
    )
  }
  if (kind !== 'backend') {
    for (const { pattern, label } of BANNED_PATTERNS) {
      if (pattern.test(source)) {
        errors.push(`Banned ${label}. Use JSX, e.g. return (<div className="p-6">Hello</div>)`)
      }
    }
  }

  let compiled = source
  if (kind !== 'backend') {
    try {
      compiled = transpileCode(source)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
      return { file: kind, ok: false, errors }
    }
  }
  try {
    // Compile only. Calling the factory would run the app's code.
    new Function(
      `"use strict"; return (function(module, exports, ctx, __jsx, React, require) {\n${compiled}\n})`,
    )
  } catch (e) {
    errors.push(`Syntax error: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (
    !/module\.exports\s*=/.test(stripped) &&
    !/exports\.default\s*=/.test(stripped) &&
    !(kind !== 'backend' && /^\s*export\s+default\s/m.test(stripped))
  ) {
    errors.push(
      'module.exports must be assigned, e.g. module.exports = function MyApp({ ctx }) { ... } (or export default function MyApp({ ctx }) { ... })',
    )
  } else if (/module\.exports\s*=\s*(['"`]|[-+]?\d|null\b|true\b|false\b)/.test(stripped)) {
    errors.push('module.exports must be a function, not a primitive.')
  }
  return { file: kind, ok: errors.length === 0, errors }
}

export function checkMiniApp(files: { frontend?: string; backend?: string; panel?: string }) {
  const results: FileCheck[] = []
  if (files.frontend !== undefined) results.push(checkFile('frontend', files.frontend))
  if (files.backend?.trim()) results.push(checkFile('backend', files.backend))
  if (files.panel?.trim()) results.push(checkFile('panel', files.panel))
  const ok = results.length > 0 && results.every((f) => f.ok)
  const result: CheckResult = {
    ok,
    message: ok
      ? 'No errors. The check does not run the app: open it (`nonladesk open <app>`) to catch render-time issues.'
      : 'Found errors. Fix them before enabling or reloading the app.',
    files: results,
  }
  return result
}
