import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { prepareEditorInstall } from '../src/release/install.js'
import { EditorReleaseManager } from '../src/release/updater.js'

const exec = promisify(execFile)
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('editorReleaseManager', () => {
  it('installs compatible components into the channel cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-release-'))
    const archives = new Map<string, Uint8Array>()
    for (const id of ['boilerplate', 'runtime']) {
      const directory = join(root, id)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'component.json'), JSON.stringify({ id, version: '1.1.0', editorRange: '^1.0.0' }))
      await writeFile(join(directory, 'payload.txt'), id)
      if (id === 'boilerplate') {
        for (const template of ['visual-novel-vue', 'plugin']) {
          await mkdir(join(directory, template), { recursive: true })
          await writeFile(join(directory, template, 'package.json'), '{}')
        }
      }
      else {
        await writeFile(join(directory, 'index.json'), JSON.stringify({ demo: { archive: 'demo-1.0.0.tgz' } }))
        await writeFile(join(directory, 'demo-1.0.0.tgz'), 'demo')
      }
      const archive = join(root, `${id}.tar.gz`)
      await exec('tar', ['-czf', archive, '-C', directory, '.'])
      archives.set(id, await readFile(archive))
    }
    const catalogs = new Map([...archives].map(([id, bytes]) => [id, {
      schemaVersion: 1,
      product: 'quaengine-editor-components',
      channel: 'stable',
      component: id,
      releases: [
        ['2.0.0', '^1.0.0'], // Excluded by the editor's accepted component range.
        ['1.2.0', '^2.0.0'], // Component requires a newer editor.
        ['1.2.0-beta.1', '^1.0.0'], // Stable never accepts beta components.
        ['1.1.0', '^1.0.0'],
      ].map(([version, editorRange]) => ({ component: id, version, editorRange, url: `https://example.test/${id}`, sha256: hash(bytes), size: bytes.byteLength })),
    }]))
    const editorArchive = Buffer.from('editor archive')
    const manifest = {
      schemaVersion: 1,
      product: 'quaengine-editor',
      channel: 'stable',
      version: '1.1.0',
      publishedAt: '2026-09-22T00:00:00.000Z',
      artifacts: [{ platform: 'linux', arch: 'x64', format: 'tar.gz', url: 'https://example.test/editor.tar.gz', sha256: hash(editorArchive), size: editorArchive.byteLength }],
    }
    const manager = new EditorReleaseManager({
      profileDirectory: join(root, 'profile'),
      embeddedDirectory: join(root, 'embedded'),
      channel: 'stable',
      editorVersion: '1.0.0',
      acceptedComponentRange: '^1.0.0',
      platform: 'linux',
      arch: 'x64',
      catalogUrl: id => `https://example.test/catalog/${id}`,
      manifestUrl: 'https://example.test/editor-manifest.json',
      fetchBytes: async url => url.includes('/catalog/')
        ? Buffer.from(JSON.stringify(catalogs.get(url.split('/').at(-1)!)!))
        : url.endsWith('editor-manifest.json')
          ? Buffer.from(JSON.stringify(manifest))
          : url.endsWith('editor.tar.gz') ? editorArchive : archives.get(url.split('/').at(-1)!)!,
    })
    const result = await manager.check(AbortSignal.timeout(5000))
    expect(result.checked).toBe(true)
    expect(result.updated.map(item => item.id).sort()).toEqual(['boilerplate', 'runtime'])
    expect(await readFile(join(manager.directories().runtimeDirectory, 'payload.txt'), 'utf8')).toBe('runtime')
    expect(result.app.phase).toBe('available')
    const downloaded = await manager.downloadEditorUpdate(AbortSignal.timeout(5000))
    expect(downloaded.app.phase).toBe('ready')
    expect(downloaded.app.downloadedPath).toBeTruthy()
  })

  it('rejects a catalog from another channel', async () => {
    const manager = new EditorReleaseManager({
      profileDirectory: join(tmpdir(), 'qua-editor-release-profile'),
      embeddedDirectory: join(tmpdir(), 'qua-editor-embedded'),
      channel: 'beta',
      editorVersion: '1.0.0-beta.1',
      manifestUrl: 'https://example.test/editor-manifest.json',
      fetchBytes: async () => Buffer.from(JSON.stringify({ channel: 'stable' })),
    })
    const result = await manager.check(AbortSignal.timeout(5000))
    expect(result.checked).toBe(false)
    expect(result.error).toContain('Invalid editor component catalog')
  })

  it('keeps the cached update unavailable when its checksum is wrong', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-release-bad-'))
    const manager = new EditorReleaseManager({
      profileDirectory: join(root, 'profile'),
      embeddedDirectory: join(root, 'embedded'),
      channel: 'stable',
      editorVersion: '1.0.0',
      platform: 'linux',
      arch: 'x64',
      manifestUrl: 'https://example.test/editor-manifest.json',
      catalogUrl: id => `https://example.test/catalog/${id}`,
      fetchBytes: async url => url.endsWith('editor-manifest.json')
        ? Buffer.from(JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor', channel: 'stable', version: '1.1.0', publishedAt: '2026-09-22T00:00:00.000Z', artifacts: [{ platform: 'linux', arch: 'x64', format: 'tar.gz', url: 'https://example.test/editor.tar.gz', sha256: 'a'.repeat(64), size: 8 }] }))
        : url.includes('/catalog/')
          ? Buffer.from(JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor-components', channel: 'stable', component: url.endsWith('boilerplate') ? 'boilerplate' : 'runtime', releases: [] }))
          : Buffer.from('tampered'),
    })
    const result = await manager.check(AbortSignal.timeout(5000))
    expect(result.checked).toBe(true)
    const downloaded = await manager.downloadEditorUpdate(AbortSignal.timeout(5000))
    expect(downloaded.app.phase).toBe('error')
    expect(downloaded.app.error).toContain('checksum mismatch')
  })

  it('prepares a validated application directory before shutdown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-install-'))
    const installed = join(root, 'installed')
    const archiveRoot = join(root, 'archive')
    const outer = join(archiveRoot, 'editor-build')
    await mkdir(join(installed, 'resources'), { recursive: true })
    await writeFile(join(installed, 'resources', 'editor-release.json'), JSON.stringify({ product: 'quaengine-editor', version: '1.1.0' }))
    await writeFile(join(installed, 'editor-bin'), '')
    await chmod(join(installed, 'editor-bin'), 0o755)
    const resources = process.platform === 'darwin' ? join(outer, 'Contents/Resources') : join(outer, 'resources')
    await mkdir(resources, { recursive: true })
    await writeFile(join(resources, 'editor-release.json'), JSON.stringify({ product: 'quaengine-editor', version: '1.2.0', channel: 'stable', platform: 'linux', arch: 'x64' }))
    await writeFile(join(outer, 'editor-bin'), '')
    await chmod(join(outer, 'editor-bin'), 0o755)
    const archive = join(root, 'editor.tar.gz')
    await exec('tar', ['-czf', archive, '-C', archiveRoot, 'editor-build'])
    const bundled = join(root, 'bundled')
    await mkdir(bundled, { recursive: true })
    for (const name of ['apply-update.sh', 'apply-update.ps1'])
      await cp(fileURLToPath(new URL(`../src/release/${name}`, import.meta.url)), join(bundled, name))
    const finish = await prepareEditorInstall({ archivePath: archive, format: 'tar.gz', installRoot: installed, executablePath: join(installed, 'editor-bin'), sha256: hash(await readFile(archive)), size: (await readFile(archive)).byteLength, version: '1.2.0', channel: 'stable', platform: 'linux', arch: 'x64' }, join(root, 'helpers'), bundled)
    await expect(prepareEditorInstall({ archivePath: archive, format: 'tar.gz', installRoot: installed, executablePath: join(installed, 'editor-bin'), sha256: hash(await readFile(archive)), size: (await readFile(archive)).byteLength, version: '1.2.0', channel: 'beta', platform: 'linux', arch: 'x64' }, join(root, 'helpers'), bundled)).rejects.toThrow('identity mismatch')
    expect(typeof finish.launch).toBe('function')
    await finish.discard()
    expect(await readFile(join(root, 'helpers', 'install-status.txt'), 'utf8')).toBe('prepared\n')
  })
  it('checks the app even if both component catalogs are unavailable, and restores only verified caches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-outage-'))
    const bytes = Buffer.from('verified application')
    const manifest = { schemaVersion: 1, product: 'quaengine-editor', channel: 'stable', version: '1.1.0', publishedAt: '2026-09-22T00:00:00Z', artifacts: [{ platform: 'linux', arch: 'x64', format: 'tar.gz', url: 'https://example.test/app', sha256: hash(bytes), size: bytes.length }] }
    const fetchBytes = vi.fn(async (url: string) => {
      if (url.endsWith('manifest'))
        return Buffer.from(JSON.stringify(manifest))
      if (url.endsWith('/app'))
        return bytes
      throw new Error('HTTP 503')
    })
    const options = { profileDirectory: root, embeddedDirectory: join(root, 'embedded'), channel: 'stable' as const, editorVersion: '1.0.0', platform: 'linux' as const, arch: 'x64' as const, manifestUrl: 'https://example.test/manifest', fetchBytes }
    const manager = new EditorReleaseManager(options)
    const result = await manager.check()
    expect(result.app.phase).toBe('available')
    expect(result.error).toContain('503')
    const ready = await manager.downloadEditorUpdate()
    expect(ready.app.phase).toBe('ready')
    const restarted = new EditorReleaseManager(options)
    expect((await restarted.check()).app.phase).toBe('ready')
    await writeFile(ready.app.downloadedPath!, Buffer.alloc(bytes.length))
    expect((await restarted.check()).app.phase).toBe('available')
  })

  it.each([
    ['stable', 'stable', '1.1.0-beta.1', 'error'],
    ['stable', 'beta', '1.1.0-beta.1', 'error'],
    ['beta', 'beta', '1.1.0-beta.1', 'available'],
    ['stable', 'stable', '0.9.0', 'idle'],
  ] as const)('selects %s channel from a %s %s manifest', async (channel, manifestChannel, version, phase) => {
    const manager = new EditorReleaseManager({
      profileDirectory: await mkdtemp(join(tmpdir(), 'qua-channel-')),
      embeddedDirectory: '',
      channel,
      editorVersion: '1.0.0',
      platform: 'linux',
      arch: 'x64',
      manifestUrl: 'https://example.test/manifest',
      fetchBytes: async () => Buffer.from(JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor', channel: manifestChannel, version, publishedAt: '2026-09-22T00:00:00Z', artifacts: [{ platform: 'linux', arch: 'x64', format: 'tar.gz', url: 'https://example.test/app', sha256: 'a'.repeat(64), size: 10 }] })),
    })
    expect((await manager.check()).app.phase).toBe(phase)
  })
})
