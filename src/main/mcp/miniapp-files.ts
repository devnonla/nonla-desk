import { readAppCode, updateMiniApp } from '../mini-app-runtime'
import { pathsPayload } from './code-files'

export const MINIAPP_FILES = ['frontend', 'backend', 'panel'] as const
export type MiniappFileKind = (typeof MINIAPP_FILES)[number]

export const CODE_FIELD: Record<MiniappFileKind, 'frontendCode' | 'backendCode' | 'panelCode'> = {
  frontend: 'frontendCode',
  backend: 'backendCode',
  panel: 'panelCode',
}

export const FILE_KIND_PROPERTY = {
  type: 'string' as const,
  enum: MINIAPP_FILES,
  description: 'Which virtual file: frontend (index.jsx), backend (index.js), or panel (index.jsx)',
}

export function parseFileKind(file: unknown): MiniappFileKind | null {
  if (file === 'frontend' || file === 'backend' || file === 'panel') return file
  return null
}

export function readFileSource(appId: string, file: MiniappFileKind): string {
  const value = readAppCode(appId)[CODE_FIELD[file]]
  return value ?? ''
}

/** Non-overlapping literal substring count — same rule as Cursor StrReplace. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (true) {
    const i = haystack.indexOf(needle, from)
    if (i === -1) return count
    count++
    from = i + needle.length
  }
}

function replaceFirstLiteral(haystack: string, oldString: string, newString: string): string {
  const i = haystack.indexOf(oldString)
  if (i === -1) return haystack
  return haystack.slice(0, i) + newString + haystack.slice(i + oldString.length)
}

function replaceAllLiteral(haystack: string, oldString: string, newString: string): string {
  if (!oldString) return haystack
  let out = ''
  let from = 0
  while (true) {
    const i = haystack.indexOf(oldString, from)
    if (i === -1) return out + haystack.slice(from)
    out += haystack.slice(from, i) + newString
    from = i + oldString.length
  }
}

export function applyReplace(
  haystack: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): { ok: true; content: string; replacements: number } | { ok: false; error: string } {
  const n = countOccurrences(haystack, oldString)
  if (n === 0) return { ok: false, error: 'not-found' }
  if (n > 1 && !replaceAll) return { ok: false, error: `not-unique:${n}` }
  const content = replaceAll
    ? replaceAllLiteral(haystack, oldString, newString)
    : replaceFirstLiteral(haystack, oldString, newString)
  return { ok: true, content, replacements: replaceAll ? n : 1 }
}

export async function saveMiniappFile(id: string, file: MiniappFileKind, content: string) {
  return updateMiniApp(id, { [CODE_FIELD[file]]: content, enabled: false })
}

export function editedPayload(id: string, file: MiniappFileKind, extra: Record<string, unknown>) {
  return {
    success: true,
    id,
    file,
    paths: pathsPayload(id),
    ...extra,
  }
}
