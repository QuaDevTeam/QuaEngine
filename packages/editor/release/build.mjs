/* eslint-disable antfu/no-top-level-await */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { arch as hostArch, platform as hostPlatform } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { packager } from '@electron/packager'
import { satisfies, valid, validRange } from 'semver'
import { electronSigningOptions, macSigningConfiguration, verifyMacApplication } from './macos-signing.mjs'

const exec = promisify(execFile)
const releaseRoot = fileURLToPath(new URL('.', import.meta.url))
const repository = resolve(releaseRoot, '../..', '..')
const electronPackage = resolve(repository, 'packages/editor/electron')
const config = JSON.parse(await readFile(join(releaseRoot, 'config.json'), 'utf8'))
const args = new Set(process.argv.slice(2))
const channel = process.env.QUA_EDITOR_CHANNEL ?? (args.has('--beta') ? 'beta' : 'stable')
const version = process.env.QUA_EDITOR_VERSION ?? config.editorVersion
const componentVersion = process.env.QUA_EDITOR_COMPONENT_VERSION ?? config.componentVersion
const target = process.env.QUA_EDITOR_TARGET ?? hostPlatform
const targetArch = process.env.QUA_EDITOR_ARCH ?? (hostArch === 'arm64' ? 'arm64' : 'x64')
if (!['stable', 'beta'].includes(channel) || !valid(version) || !valid(componentVersion) || !['darwin', 'win32', 'linux', 'macos', 'windows'].includes(target) || !['arm64', 'x64'].includes(targetArch))
  throw new Error('Invalid editor release identity.')
if (channel === 'stable' && version.includes('-'))
  throw new Error('Stable editor releases must use a non-prerelease version.')
if (channel === 'beta' && !version.includes('-'))
  throw new Error('Beta editor releases must use a prerelease version.')
const platform = target === 'macos' ? 'darwin' : target === 'windows' ? 'win32' : target
const signing = macSigningConfiguration(process.env, platform)
if (!validRange(config.componentEditorRange) || !validRange(config.acceptedComponentRange) || !satisfies(version, config.componentEditorRange, { includePrerelease: true }) || !satisfies(componentVersion, config.acceptedComponentRange, { includePrerelease: channel === 'beta' }))
  throw new Error('Embedded components must be compatible with the editor release version.')
if (platform !== hostPlatform || targetArch !== hostArch)
  throw new Error('Build release binaries on their target OS and architecture (native modules are host-specific).')
const applicationName = channel === 'beta' ? 'quaengine-editor-beta' : 'quaengine-editor'
const platformLabel = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'
const releaseDirectory = resolve(electronPackage, 'dist/release', channel, version)
const staging = resolve(electronPackage, 'dist/release-staging', `${channel}-${version}-${platformLabel}-${targetArch}`)
await rm(releaseDirectory, { recursive: true, force: true })
await rm(staging, { recursive: true, force: true })

if (process.env.QUA_EDITOR_SKIP_BUILD !== '1') {
  await exec('pnpm', ['--filter', '@quajs/editor-electron...', 'build'], {
    cwd: repository,
    env: {
      ...process.env,
      QUA_EDITOR_VERSION: version,
      QUA_EDITOR_COMPONENT_EDITOR_RANGE: config.componentEditorRange,
      QUA_EDITOR_COMPONENT_VERSION: componentVersion,
      QUA_EDITOR_BOILERPLATE_VERSION: componentVersion,
      QUA_EDITOR_RUNTIME_VERSION: componentVersion,
    },
    maxBuffer: 32 * 1024 * 1024,
  })
}
await mkdir(releaseDirectory, { recursive: true })
await mkdir(staging, { recursive: true })
await writeFile(join(electronPackage, 'dist/release-channel.json'), `${JSON.stringify({ channel, version, acceptedComponentRange: config.acceptedComponentRange, signingTeamId: signing?.teamId }, null, 2)}\n`)

const app = join(staging, 'app')
// A self-contained hoisted production tree preserves dependency resolution after
// packager copies it; isolated pnpm links otherwise lose their real lookup context.
await exec('pnpm', ['--filter', '@quajs/editor-electron', '--config.node-linker=hoisted', 'deploy', '--prod', app, '--force'], {
  cwd: repository,
  maxBuffer: 32 * 1024 * 1024,
})
await rm(join(app, 'dist'), { recursive: true, force: true })
const appDist = join(app, 'dist')
await mkdir(appDist, { recursive: true })
for (const entry of await readdir(join(electronPackage, 'dist'))) {
  if (entry === 'release' || entry === 'release-staging' || entry === 'component-release')
    continue
  await cp(join(electronPackage, 'dist', entry), join(appDist, entry), { recursive: true, dereference: true })
}
for (const entry of ['.turbo', 'scripts', 'src', 'test', 'tsconfig.json', 'vitest.config.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
  await rm(join(app, entry), { recursive: true, force: true })
// Report early dependency/loading failures to CI logs before opening a native dialog.
await writeFile(join(appDist, 'entry.mjs'), `import { app, dialog } from 'electron'
await import('./main.js').catch(error => {
  console.error('Editor failed to load:', error)
  dialog.showErrorBox('Editor failed to load', String(error))
  app.exit(1)
})
`)
const applicationManifest = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'))
applicationManifest.main = 'dist/entry.mjs'
applicationManifest.version = version
await writeFile(join(app, 'package.json'), `${JSON.stringify(applicationManifest, null, 2)}\n`)
const revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim()
await writeFile(join(app, 'SOURCE.txt'), `QuaEngine Editor ${version} (${channel})\nCovered source: https://github.com/${config.repository}/tree/${revision}/packages/editor\nLicense: MPL-2.0. See LICENSE and NOTICE; dependency licenses are included with their packages.\n`)
const require = createRequire(join(electronPackage, 'package.json'))
const electronVersion = JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8')).version
const output = join(staging, 'app-output')
await mkdir(output, { recursive: true })
const releaseIdentity = join(staging, 'editor-release.json')
await writeFile(releaseIdentity, `${JSON.stringify({ product: 'quaengine-editor', channel, version, platform: platformLabel, arch: targetArch }, null, 2)}\n`)
const packed = await packager({
  dir: app,
  out: output,
  platform,
  arch: targetArch,
  electronVersion,
  overwrite: true,
  prune: false,
  asar: {
    unpack: '**/*.node',
    // These native modules resolve adjacent executables/shared libraries themselves.
    unpackDir: 'node_modules/{node-pty,@vscode/ripgrep,@img/*,lzma-native}',
  },
  extraResource: [releaseIdentity],
  ignore: (filePath) => {
    const normalized = filePath.replaceAll('\\', '/')
    // Templates and runtime dependencies may need src/config files at runtime.
    // Root development files are removed from staging above; never prune by basename.
    return /(?:^|\/)\.turbo(?:\/|$)/u.test(normalized)
  },
  name: applicationName,
  appVersion: version,
  appBundleId: channel === 'beta' ? 'com.quadevteam.quaengine.editor.beta' : 'com.quadevteam.quaengine.editor',
  osxSign: signing ? electronSigningOptions(signing) : undefined,
  osxNotarize: signing ? { keychain: signing.keychain, keychainProfile: signing.keychainProfile } : undefined,
  icon: join(electronPackage, 'dist/icons', platform === 'darwin' ? 'quaeditor.icns' : platform === 'win32' ? 'quaeditor.ico' : 'quaeditor.png'),
})
const packedDirectory = packed[0]
const applicationDirectory = platform === 'darwin' ? join(packedDirectory, `${applicationName}.app`) : packedDirectory
if (signing)
  await verifyMacApplication(applicationDirectory, signing, channel)
const artifactName = `QuaEngine-Editor-${channel}-${platformLabel}-${targetArch}.tar.gz`
const artifact = join(releaseDirectory, artifactName)
await exec('tar', ['-czf', artifact, '-C', dirname(applicationDirectory), basename(applicationDirectory)], { maxBuffer: 4 * 1024 * 1024 })
let macosSigning
if (signing) {
  const extracted = join(staging, 'archive-verification')
  await mkdir(extracted)
  await exec('tar', ['-xzf', artifact, '--no-same-owner', '-C', extracted], { maxBuffer: 4 * 1024 * 1024 })
  const entries = await readdir(extracted)
  if (entries.length !== 1 || entries[0] !== `${applicationName}.app`)
    throw new Error('The signed editor archive does not contain exactly one application.')
  macosSigning = await verifyMacApplication(join(extracted, entries[0]), signing, channel)
}
const artifactBytes = await readFile(artifact)
await writeFile(join(releaseDirectory, 'artifact-metadata.json'), `${JSON.stringify({
  channel,
  version,
  platform: platformLabel,
  arch: targetArch,
  fileName: artifactName,
  sha256: createHash('sha256').update(artifactBytes).digest('hex'),
  size: artifactBytes.byteLength,
  macosSigning,
}, null, 2)}\n`)

await rm(staging, { recursive: true, force: true })
process.stdout.write(`Editor ${channel} ${version}: ${artifactName}\n`)
