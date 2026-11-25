/**
 * Libraries for mini app frontends. A mini app can `import` any npm package or
 * https URL; the desktop fetches it before the code runs.
 *
 *   import { Button, DatePicker } from 'antd'          → https://esm.sh/antd
 *   import dayjs from 'dayjs@1'                         → https://esm.sh/dayjs@1
 *   import confetti from 'https://esm.sh/canvas-confetti'
 *   import 'antd/dist/reset.css'                        → a <link>, no export
 *
 * React is the desktop's own copy: the import map in index.html points `react`,
 * `react-dom` and the JSX runtime at /vendor/*, so a library's hooks work.
 */

const CDN = 'https://esm.sh/'
const CSS_CDN = 'https://cdn.jsdelivr.net/npm/'
const SHARED = 'external=react,react-dom'
// One file per package: esm.sh's unbundled graph of big libraries (antd…) can fail to link in the webview.
const BUNDLE = 'bundle'

const REQUIRE_RE = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g

type Host = {
  React: Record<string, unknown>
  ReactDOM: Record<string, unknown>
  ReactDOMClient: Record<string, unknown>
  jsxRuntime: Record<string, unknown>
}

/** Called once at startup (main.tsx) so /vendor/* can re-export the desktop's React. */
export function exposeHost(host: Host) {
  ;(window as unknown as { __nonla: Host }).__nonla = host
}

function host(): Host {
  return (window as unknown as { __nonla: Host }).__nonla
}

/** A module as the compiled `import` code expects it: ES namespace + `__esModule`. */
function asModule(ns: Record<string, unknown>, fallbackDefault?: unknown) {
  const hasDefault = 'default' in ns
  return Object.assign({ __esModule: true }, hasDefault ? {} : { default: fallbackDefault }, ns)
}

const BUILTIN: Record<string, () => unknown> = {
  react: () => asModule(host().React, host().React),
  'react/jsx-runtime': () => asModule(host().jsxRuntime),
  'react/jsx-dev-runtime': () => asModule(host().jsxRuntime),
  'react-dom': () => asModule(host().ReactDOM, host().ReactDOM),
  'react-dom/client': () => asModule(host().ReactDOMClient),
}

/** esm.sh flags: share the desktop's React, and bundle the package unless the import says otherwise. */
function withShared(url: string): string {
  let out = url
  if (!/[?&]external=/.test(out)) out += `${out.includes('?') ? '&' : '?'}${SHARED}`
  if (!/[?&]bundle(=|&|$)/.test(out)) out += `&${BUNDLE}`
  return out
}

function isCss(spec: string): boolean {
  return /\.css($|\?)/.test(spec)
}

function cssUrl(spec: string): string {
  return /^https?:\/\//.test(spec) ? spec : `${CSS_CDN}${spec}`
}

function scriptUrl(spec: string): string {
  if (/^https?:\/\//.test(spec)) {
    return new URL(spec).hostname === 'esm.sh' ? withShared(spec) : spec
  }
  if (/^[./]/.test(spec)) {
    throw new Error(
      `Cannot import "${spec}": relative imports are not supported. Use a package name or a full https:// URL.`,
    )
  }
  return withShared(`${CDN}${spec}`)
}

function loadCss(url: string) {
  const exists = [...document.querySelectorAll('link[data-nonla-css]')].some(
    (l) => l.getAttribute('data-nonla-css') === url,
  )
  if (exists) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.setAttribute('data-nonla-css', url)
  document.head.appendChild(link)
}

// ─── Pin on first use ────────────────────────────────────────────────────────
// `antd` resolves to a versioned, immutable file (`/antd@6.7.2/…bundle.mjs`). The first time
// an import is used we remember that file, so later runs load it from the webview cache
// without asking esm.sh again, and the version only changes when the app asks for one.

const PIN_KEY = 'nonla:pinned-modules'
const ENTRY_RE = /^export \* from "(\/[^"]+)"/m

function readPins(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function savePin(url: string, pinned: string) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify({ ...readPins(), [url]: pinned }))
  } catch {
    // storage unavailable: the import still works, it just is not pinned
  }
}

async function pinned(url: string): Promise<string> {
  if (new URL(url).hostname !== 'esm.sh') return url
  const known = readPins()[url]
  if (known) return known
  try {
    const entry = (await (await fetch(url)).text()).match(ENTRY_RE)
    if (entry) {
      const target = new URL(entry[1], url).toString()
      savePin(url, target)
      return target
    }
  } catch {
    // fall through: import the entry URL itself
  }
  return url
}

const loaded = new Map<string, Promise<unknown>>()

function loadModule(spec: string): Promise<unknown> {
  const builtin = BUILTIN[spec]
  if (builtin) return Promise.resolve(builtin())
  if (isCss(spec)) {
    loadCss(cssUrl(spec))
    return Promise.resolve({ __esModule: true })
  }
  let url: string
  try {
    url = scriptUrl(spec)
  } catch (e) {
    return Promise.reject(e)
  }
  let p = loaded.get(url)
  if (!p) {
    p = pinned(url)
      .then((target) => import(/* @vite-ignore */ target))
      .then((ns) => asModule(ns))
      .catch((e) => {
        loaded.delete(url)
        throw new Error(`Cannot load "${spec}" from ${url}: ${e?.message ?? e}`)
      })
    loaded.set(url, p)
  }
  return p
}

/** Names of the modules the compiled code asks for. */
export function requiredModules(compiled: string): string[] {
  return [...new Set([...compiled.matchAll(REQUIRE_RE)].map((m) => m[2]))]
}

/** Load every module the compiled code requires. Resolves to {} when there are none. */
export async function loadModules(compiled: string): Promise<Record<string, unknown>> {
  const specs = requiredModules(compiled)
  const entries = await Promise.all(specs.map(async (s) => [s, await loadModule(s)] as const))
  return Object.fromEntries(entries)
}
