/**
 * Write release/latest.json for the in-app updater from the signed universal
 * archive (scripts/build-app.ts --archive) and the CHANGELOG section of this version.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const out = join(root, 'release')
const repo = process.env.GITHUB_REPOSITORY
if (!repo)
  throw new Error(
    'Set GITHUB_REPOSITORY (owner/name) so the manifest can link to the release assets.',
  )

const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const section = new RegExp(
  `^## \\[${version.replaceAll('.', '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`,
  'm',
).exec(changelog)?.[1]
const notes = (section ?? '')
  .replace(/^#+\s*/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^- /gm, '• ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const name = 'nonla-desk-universal.app.tar.gz'
const sig = join(out, `${name}.sig`)
if (!existsSync(sig)) throw new Error(`Missing ${sig}. Build with the updater keys set.`)
const signature = readFileSync(sig, 'utf8').trim()
const url = `https://github.com/${repo}/releases/download/v${version}/${name}`

// One universal app serves both architectures.
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { signature, url },
    'darwin-x86_64': { signature, url },
  },
}
writeFileSync(join(out, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote release/latest.json for ${version}`)
