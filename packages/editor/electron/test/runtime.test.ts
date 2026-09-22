import type { EditorProject, EditorRuntimeState } from '@quajs/editor-core'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../src/project-service/project.js'
import { createEditorProject } from '../src/project-service/scaffold.js'
import { runTool } from '../src/runtime/process.js'
import { dependencyInstallArguments, missingDependencies, ProjectRuntime } from '../src/runtime/project-runtime.js'
import { ManagedTools, verifyDownload } from '../src/runtime/tools.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-runtime-')))
  roots.push(root)
  return root
}
function project(root: string, native = false): EditorProject {
  return { root, name: 'fixture', bundleId: 'dev.test', files: [], entries: [], directories: [], diagnostics: [], story: [], targets: { web: { enabled: true }, native: { enabled: native } } }
}
describe('project creation and runtime repair', () => {
  it('creates both project kinds and refuses existing directories, traversal and symlinks', async () => {
    const parent = await fixture()
    const game = await createEditorProject(parent, { kind: 'game', name: 'my-game' })
    const plugin = await createEditorProject(parent, { kind: 'plugin', name: 'my-plugin' })
    const service = new ProjectService()
    expect((await service.open(game)).targets.web.enabled).toBe(true)
    const opened = await service.open(plugin)
    expect(opened.pluginProject?.metadata?.runtime).toBeDefined()
    expect(opened.targets.web.enabled).toBe(false)
    expect(opened.targets.native.enabled).toBe(false)
    expect(opened.diagnostics).toEqual([])
    const before = await readFile(join(plugin, 'package.json'), 'utf8')
    await expect(createEditorProject(parent, { kind: 'plugin', name: 'my-plugin' })).rejects.toThrow()
    expect(await readFile(join(plugin, 'package.json'), 'utf8')).toBe(before)
    await expect(createEditorProject(parent, { kind: 'plugin', name: '../escape' })).rejects.toThrow()
    await symlink(plugin, join(parent, 'linked'))
    await expect(createEditorProject(parent, { kind: 'plugin', name: 'linked' })).rejects.toThrow()
    await expect(stat(join(plugin, 'qua.project.json'))).rejects.toThrow()
  })

  it('detects individual missing packages, version drift and missing CLI artifacts, including hoisted dependencies', async () => {
    const root = await fixture()
    const child = join(root, 'project')
    await mkdir(join(root, 'node_modules/fixture'), { recursive: true })
    await mkdir(child)
    await writeFile(join(child, 'package.json'), JSON.stringify({ dependencies: { fixture: '^2.0.0' }, devDependencies: { absent: '^1.0.0' } }))
    const manifest = join(root, 'node_modules/fixture/package.json')
    await writeFile(manifest, JSON.stringify({ name: 'fixture', version: '1.0.0' }))
    expect(await missingDependencies(child)).toEqual(['fixture', 'absent'])
    await writeFile(manifest, JSON.stringify({ name: 'fixture', version: '2.0.0', bin: 'cli.js' }))
    expect(await missingDependencies(child)).toEqual(['fixture', 'absent'])
    await writeFile(join(root, 'node_modules/fixture/cli.js'), '')
    expect(await missingDependencies(child)).toEqual(['absent'])
  })

  it('installs a real local dependency with lifecycle scripts suppressed and rechecks readiness', async () => {
    const root = await fixture()
    const dependency = join(root, 'dependency')
    await mkdir(dependency)
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'fixture-runtime', version: '1.0.0', main: 'index.js' }))
    await writeFile(join(dependency, 'index.js'), 'export const ready = true')
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'fixture-runtime': 'file:./dependency' }, scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'UNSAFE\',\'ran\')"' } }))
    const states: EditorRuntimeState[] = []
    const runtime = new ProjectRuntime(join(root, 'tools'), state => states.push(state), async () => ({ env: process.env, manager: 'npm' }))
    const first = runtime.ensure(project(root))
    expect(runtime.ensure(project(root))).toBe(first)
    await first
    expect(runtime.snapshot()?.phase).toBe('ready')
    expect(await missingDependencies(root)).toEqual([])
    await expect(stat(join(root, 'UNSAFE'))).rejects.toThrow()
    expect(states.some(state => state.phase === 'installing')).toBe(true)
    expect(dependencyInstallArguments('pnpm', true)).toContain('--frozen-lockfile')
  }, 30_000)

  it('cancels provisioning, blocks automatic retry loops and permits explicit retry', async () => {
    const root = await fixture()
    await writeFile(join(root, 'package.json'), '{}')
    let fail = true
    const runtime = new ProjectRuntime(join(root, 'tools'), () => {}, async (_root, _native, operation) => {
      if (fail)
        await new Promise<void>((_resolve, reject) => operation.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      return { env: process.env, manager: 'npm' }
    })
    const pending = runtime.ensure(project(root)).catch(() => {})
    await runtime.cancel()
    await pending
    expect(runtime.snapshot()?.phase).toBe('cancelled')
    await expect(runtime.ensure(project(root))).rejects.toThrow('取消')
    fail = false
    await runtime.ensure(project(root), true)
    expect(runtime.snapshot()?.phase).toBe('ready')
  })

  it('rejects corrupted downloads and accepts exact official checksum entries', () => {
    const bytes = Buffer.from('artifact')
    const digest = createHash('sha256').update(bytes).digest('hex')
    expect(() => verifyDownload(bytes, `${digest}  node.tar.gz`, 'node.tar.gz')).not.toThrow()
    expect(() => verifyDownload(bytes, `${digest} *./rustup-init`, 'rustup-init')).not.toThrow()
    expect(() => verifyDownload(bytes, `${digest}  other.tar.gz`, 'node.tar.gz')).toThrow('校验')
    expect(() => verifyDownload(Buffer.from('changed'), digest, 'rustup-init')).toThrow('校验')
  })

  it.skipIf(process.platform === 'win32')('kills a cancelled owned installation process', async () => {
    const root = await fixture()
    const controller = new AbortController()
    let pid = 0
    const pending = runTool(process.execPath, ['-e', 'console.log(process.pid); process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], root, { signal: controller.signal, env: process.env, report: (text) => {
      pid = Number(text.trim())
    } }).catch(error => error)
    await expect.poll(() => pid).toBeGreaterThan(0)
    controller.abort()
    expect(await pending).toBeInstanceOf(Error)
    expect(() => process.kill(pid, 0)).toThrow()
  }, 10_000)
})

// Opt-in real downloads into an isolated directory; never changes the user's toolchain.
it.skipIf(process.env.QUA_EDITOR_TOOLCHAIN_SMOKE !== '1')('downloads and verifies Node.js and Rust with no tools on PATH', async () => {
  const root = await fixture()
  await writeFile(join(root, 'package.json'), '{}')
  const tools = new ManagedTools(join(root, 'tools'))
  const original = tools.environment.bind(tools)
  tools.environment = () => {
    const env = original()
    return { ...env, PATH: env.PATH!.replace(process.env.PATH!, '/usr/bin:/bin:/usr/sbin:/sbin') }
  }
  const signal = new AbortController().signal
  const result = await tools.prepare(root, true, { signal, report: text => process.stdout.write(text) })
  expect(await runTool('node', ['--version'], root, { signal, env: result.env, report() {} })).toMatch(/^v/)
  expect(await runTool('cargo', ['--version'], root, { signal, env: result.env, report() {} })).toContain('cargo')
}, 600_000)
