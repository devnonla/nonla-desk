/**
 * Build the macOS app. With updater keys set, also sign the update archive.
 *
 *   bun scripts/build-app.ts [--target universal-apple-darwin] [--debug] [--archive]
 *
 * The updater is on only when NONLA_UPDATER_PUBKEY, TAURI_SIGNING_PRIVATE_KEY and
 * GITHUB_REPOSITORY (or NONLA_UPDATER_ENDPOINT) are set. The pubkey and endpoint
 * go in through --config and as compile-time env (option_env! in updater.rs), so
 * a build without keys has no updater and never pulls this repo's releases.
 *
 * --archive writes release/: the DMG, nonla-desk-universal.app.tar.gz and, when
 * signed, its .sig for scripts/updater-manifest.ts.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'

const root = join(import.meta.dir, '..')
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const target = option('--target') ?? 'universal-apple-darwin'
const profile = flag('--debug') ? 'debug' : 'release'
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version

const pubkey = process.env.NONLA_UPDATER_PUBKEY?.trim()
const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
const repo = process.env.GITHUB_REPOSITORY?.trim()
const endpoint =
  process.env.NONLA_UPDATER_ENDPOINT?.trim() ||
  (repo ? `https://github.com/${repo}/releases/latest/download/latest.json` : '')
const updater = Boolean(pubkey && signingKey && endpoint)

const env: Record<string, string | undefined> = {
  ...process.env,
  NONLA_UPDATER_PUBKEY: '',
  NONLA_UPDATER_ENDPOINT: '',
}
const configArgs: string[] = []
if (updater) {
  env.NONLA_UPDATER_PUBKEY = pubkey
  env.NONLA_UPDATER_ENDPOINT = endpoint
  configArgs.push(
    '--config',
    JSON.stringify({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey, endpoints: [endpoint] } },
    }),
  )
  console.log(`Updater on: ${endpoint}`)
} else {
  console.log(
    'Updater off: set NONLA_UPDATER_PUBKEY, TAURI_SIGNING_PRIVATE_KEY and GITHUB_REPOSITORY (or NONLA_UPDATER_ENDPOINT) to turn it on.',
  )
}

const tauriArgs = [
  '--target',
  target,
  '--bundles',
  'app,dmg',
  ...(flag('--debug') ? ['--debug'] : []),
  ...configArgs,
]
await $`bunx tauri build ${tauriArgs}`.cwd(root).env(env)

const bundle = join(root, 'src-tauri', 'target', target, profile, 'bundle')
console.log(`\nApp ready in ${bundle}`)

if (flag('--archive')) {
  const out = join(root, 'release')
  mkdirSync(out, { recursive: true })
  const archive = join(out, 'nonla-desk-universal.app.tar.gz')
  rmSync(`${archive}.sig`, { force: true })

  const signed = join(bundle, 'macos', 'Nonla Desk.app.tar.gz')
  if (updater) {
    if (!existsSync(signed) || !existsSync(`${signed}.sig`)) {
      throw new Error(`Tauri did not produce the signed update archive ${signed}(.sig).`)
    }
    copyFileSync(signed, archive)
    copyFileSync(`${signed}.sig`, `${archive}.sig`)
  } else {
    await $`tar -czf ${archive} -C ${join(bundle, 'macos')} ${'Nonla Desk.app'}`
  }

  const dmg = readdirSync(join(bundle, 'dmg')).find((f) => f.endsWith('.dmg'))
  if (!dmg) throw new Error(`No DMG in ${join(bundle, 'dmg')}`)
  copyFileSync(join(bundle, 'dmg', dmg), join(out, `nonla-desk-${version}-universal.dmg`))
  console.log(`Release files in ${out}`)
}
