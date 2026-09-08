import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAppCodePaths, getAppsDir } from '../mini-app-runtime'

const MAX_CODE_FILE_BYTES = 1_000_000
const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const SENSITIVE_SEGMENTS = new Set(['.ssh', '.gnupg', '.aws', '.kube', '.docker', 'keychains'])
const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'credentials',
  'credentials.json',
])
const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.kdbx'])

export const CODE_PATH_PROPERTIES = {
  frontendPath: {
    type: 'string',
    description:
      'Absolute path to a .jsx/.js file to read as frontend. Prefer this over frontendCode — write the file with the IDE, then pass the path (no JSON escaping). Path must be under the workspace, app dir, or temp dir.',
  },
  backendPath: {
    type: 'string',
    description: 'Absolute path to a .js file to read as backend. Prefer this over backendCode.',
  },
  panelPath: {
    type: 'string',
    description: 'Absolute path to a .jsx file to read as panel. Prefer this over panelCode.',
  },
}

function isUnder(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function assertAllowedCodePath(resolved: string, label: string): void {
  const real = fs.realpathSync(resolved)
  const home = os.homedir()
  const tmp = os.tmpdir()
  const apps = getAppsDir()

  const allowedRoot = isUnder(apps, real) || isUnder(tmp, real) || isUnder(home, real)
  if (!allowedRoot) {
    throw new Error(
      `${label} is outside allowed directories (home, temp, or ~/.nonla-desk/apps): ${real}`,
    )
  }

  const parts = real.split(path.sep).map((p) => p.toLowerCase())
  if (parts.some((p) => SENSITIVE_SEGMENTS.has(p))) {
    throw new Error(`${label} points at a sensitive path: ${real}`)
  }

  const base = path.basename(real).toLowerCase()
  if (SENSITIVE_BASENAMES.has(base) || base.startsWith('.env')) {
    throw new Error(`${label} cannot read this filename: ${path.basename(real)}`)
  }

  const ext = path.extname(real).toLowerCase()
  if (SENSITIVE_EXTENSIONS.has(ext)) {
    throw new Error(`${label} cannot read ${ext} files`)
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `${label} must be a JS/JSX/TS file (${[...ALLOWED_EXTENSIONS].join(', ')}), got ${ext || 'no extension'}`,
    )
  }
}

export function readCodeFile(filePath: string, label = 'path'): string {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} not found: ${resolved}`)
  }
  const stat = fs.statSync(resolved)
  if (stat.size > MAX_CODE_FILE_BYTES) {
    throw new Error(
      `${label} is too large (${stat.size} bytes). Max is ${MAX_CODE_FILE_BYTES} bytes.`,
    )
  }
  assertAllowedCodePath(resolved, label)
  return fs.readFileSync(resolved, 'utf8')
}

/** Resolve *Code / *Path into filesystem code fields. Path wins over inline string. */
export function resolveCodeFields(args: Record<string, any>): {
  frontendCode?: string
  backendCode?: string
  panelCode?: string | null
} {
  const out: {
    frontendCode?: string
    backendCode?: string
    panelCode?: string | null
  } = {}

  if (args.frontendPath) out.frontendCode = readCodeFile(args.frontendPath, 'frontendPath')
  else if (args.frontendCode !== undefined) out.frontendCode = args.frontendCode

  if (args.backendPath) out.backendCode = readCodeFile(args.backendPath, 'backendPath')
  else if (args.backendCode !== undefined) out.backendCode = args.backendCode

  if (args.panelPath) out.panelCode = readCodeFile(args.panelPath, 'panelPath')
  else if (args.panelCode !== undefined) out.panelCode = args.panelCode

  return out
}

export function pathsPayload(appId: string) {
  return getAppCodePaths(appId)
}

export function fileFlags(appId: string): {
  hasFrontend: boolean
  hasBackend: boolean
  hasPanel: boolean
} {
  const paths = getAppCodePaths(appId)
  const nonempty = (filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
    } catch {
      return false
    }
  }
  return {
    hasFrontend: nonempty(paths.frontend),
    hasBackend: nonempty(paths.backend),
    hasPanel: nonempty(paths.panel),
  }
}
