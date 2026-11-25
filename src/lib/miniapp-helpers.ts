import React from 'react'
import { transform } from 'sucrase'
import { api } from '@/lib/api'
import * as MiniAppUIComponents from '../components/ui/MiniAppUI'
import { loadModules } from './miniapp-modules'

// ─── JSX pragma (used internally by Sucrase transpiler, NOT exposed to mini apps) ──

export function __jsx(type: any, props?: any, ...children: any[]) {
  return React.createElement(type, props, ...children)
}

// ─── Build context object for mini app frontend code ─────────────────────────

export function buildFrontendContext(appId: string) {
  // IPC bridge for frontend ↔ backend communication
  const ipc = {
    send(channel: string, data: any) {
      api.sendMiniAppIpc(appId, channel, data)
    },
    on(channel: string, handler: (data: any) => void) {
      return api.onMiniAppIpc(appId, channel, handler)
    },
  }

  // Scoped storage
  const storage = {
    get: (key: string) => api.miniAppStorageGet(appId, key),
    set: (key: string, value: string) => api.miniAppStorageSet(appId, key, value),
    delete: (key: string) => api.miniAppStorageDelete(appId, key),
    getAll: () => api.miniAppStorageGetAll(appId),
  }

  // Media APIs
  const media = {
    getDesktopSources: (opts?: any) => api.miniAppGetDesktopSources(opts),
    getMediaAccess: (type: string) => api.getMediaAccess(type),
    askMediaAccess: (type: string) => api.askMediaAccess(type),
  }

  return {
    appId,
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useCallback: React.useCallback,
    useMemo: React.useMemo,
    ui: MiniAppUIComponents,
    /** Removed: icon sets are not bundled. Use ctx.ui.Icon or draw an inline <svg>. */
    get icons(): never {
      throw new Error(
        'ctx.icons was removed. Use <ctx.ui.Icon name="copy" /> (devnonla-ui glyphs) or draw the icon as an inline <svg> in your file. Run `nonla guide` for the list.',
      )
    },
    ipc,
    storage,
    media,
    notify: (title: string, body?: string, opts?: { silent?: boolean }) =>
      api.miniAppNotify({ title, body, silent: opts?.silent }),
    tray: {
      hide: () => api.hideTray?.(),
    },
  }
}

// ─── Source Code Validation ──────────────────────────────────────────────────

const BANNED_PATTERNS = [
  { pattern: /\bctx\.h\s*\(/, label: 'ctx.h()' },
  { pattern: /\bReact\.createElement\s*\(/, label: 'React.createElement()' },
  // Detect standalone h() calls — but only at word boundary (not in variable names like 'width')
  // Match: h(, h (, but not: Math(, path(, width(
  { pattern: /(?:^|[^a-zA-Z0-9_$.])h\s*\(/, label: 'h()' },
]

function validateSourceCode(code: string): void {
  for (const { pattern, label } of BANNED_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(
        `❌ Manual createElement detected: ${label}\n` +
          'Mini apps MUST use JSX syntax (auto-transpiled by Sucrase).\n' +
          'Example: return (<div className="p-6">Hello</div>)\n' +
          'Do NOT use ctx.h(), h(), or React.createElement().',
      )
    }
  }
}

// ─── JSX Transpiler ──────────────────────────────────────────────────────────

/** Transpiled output by source, so reopening a window or the tray panel skips Sucrase. */
const transpileCache = new Map<string, string>()
const TRANSPILE_CACHE_MAX = 64

export function transpileCode(code: string): string {
  const cached = transpileCache.get(code)
  if (cached !== undefined) return cached
  const out = transpileUncached(code)
  if (transpileCache.size >= TRANSPILE_CACHE_MAX) {
    transpileCache.delete(transpileCache.keys().next().value as string)
  }
  transpileCache.set(code, out)
  return out
}

/** `import … from`, `import 'x'` or `export` at the start of a line. */
const MODULE_SYNTAX = /^\s*(?:import\s*[\w{*'"]|export\s)/m

function transpileUncached(code: string): string {
  const modules = MODULE_SYNTAX.test(code)
  // Detect JSX syntax: look for <Component or <tag patterns
  if (modules || /<[A-Za-z]/.test(code)) {
    try {
      const result = transform(code, {
        // `imports` turns import/export into require()/exports, served by loadModules.
        transforms: modules ? ['jsx', 'imports'] : ['jsx'],
        jsxPragma: '__jsx',
        jsxFragmentPragma: 'React.Fragment',
        production: true,
      })
      return result.code
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error('[MiniApp] JSX transpile failed:', msg)
      throw new Error(`JSX syntax error: ${msg}`)
    }
  }
  return code
}

// ─── Evaluate mini app code and return component ─────────────────────────────

/** Load the libraries a frontend/panel imports, ready for `evaluateComponent`. */
export function loadModulesFor(code: string): Promise<Record<string, unknown>> {
  if (!code || code.trim() === '') return Promise.resolve({})
  return loadModules(transpileCode(code))
}

export function evaluateComponent(
  code: string,
  ctx: ReturnType<typeof buildFrontendContext>,
  modules: Record<string, unknown> = {},
): React.ComponentType<any> | null {
  if (!code || code.trim() === '') return null

  try {
    // Validate: reject ctx.h(), h(), React.createElement() in source
    validateSourceCode(code)

    const transpiledCode = transpileCode(code)
    const moduleObj = { exports: {} as any }
    const wrappedCode = `(function(module, exports, ctx, __jsx, React, require) { ${transpiledCode} \n})`
    const fn = new Function(`return ${wrappedCode}`)()
    const req = (name: string) => {
      if (name in modules) return modules[name]
      throw new Error(`Cannot find module "${name}"`)
    }
    fn(moduleObj, moduleObj.exports, ctx, __jsx, React, req)

    const component = moduleObj.exports
    if (typeof component === 'function') {
      return component
    }
    // `export default function …`
    if (typeof component?.default === 'function') {
      return component.default
    }
    return null
  } catch (e) {
    console.error('[MiniApp] Failed to evaluate code:', e)
    throw e
  }
}
