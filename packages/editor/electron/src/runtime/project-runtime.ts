import type { EditorProject, EditorRuntimeState } from '@quajs/editor-core'
import type { RuntimeOperation } from './process.js'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isNpmPackageName } from '@quajs/editor-core'
import { satisfies, validRange } from 'semver'
import { runTool } from './process.js'
import { ManagedTools } from './tools.js'

async function readManifest(path: string): Promise<Record<string, any>> {
  if ((await stat(path)).size > 2 * 1024 * 1024)
    throw new Error('package.json 超过 2 MB。')
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function missingDependencies(root: string): Promise<string[]> {
  const manifest = await readManifest(join(root, 'package.json'))
  const declared = { ...manifest.dependencies, ...manifest.devDependencies }
  const names = Object.keys(declared)
  if (names.length > 2000)
    throw new Error('项目直接依赖超过 2000 项。')
  const missing: string[] = []
  for (const name of names) {
    if (!isNpmPackageName(name) || typeof declared[name] !== 'string')
      throw new Error('package.json 中有无效的依赖声明。')
    let directory = root
    let found = false
    while (true) {
      const packageRoot = join(directory, 'node_modules', name)
      const installed = await readManifest(join(packageRoot, 'package.json')).catch(() => undefined)
      if (installed) {
        const range = validRange(declared[name])
        found = Boolean(!range || (typeof installed.version === 'string' && satisfies(installed.version, range)))
        const binaries = typeof installed.bin === 'string' ? [installed.bin] : Object.values(installed.bin ?? {})
        for (const entry of [installed.main, installed.types, ...binaries]) {
          if (typeof entry === 'string' && !await stat(join(packageRoot, entry)).catch(() => undefined))
            found = false
        }
        break
      }
      const parent = dirname(directory)
      if (parent === directory)
        break
      directory = parent
    }
    if (!found)
      missing.push(name)
  }
  return missing
}

export function dependencyInstallArguments(manager: 'npm' | 'pnpm', frozen: boolean): string[] {
  return manager === 'pnpm'
    ? ['install', '--ignore-scripts', '--prod=false', ...(frozen ? ['--frozen-lockfile'] : [])]
    : ['install', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund']
}

export class ProjectRuntime {
  private controller?: AbortController
  private pending?: Promise<void>
  private state?: EditorRuntimeState
  private env?: NodeJS.ProcessEnv
  private timer?: ReturnType<typeof setTimeout>
  private readonly tools: ManagedTools

  constructor(directory: string, private readonly changed: (state: EditorRuntimeState) => void, private readonly provision?: (root: string, native: boolean, operation: Omit<RuntimeOperation, 'env'>) => ReturnType<ManagedTools['prepare']>) {
    this.tools = new ManagedTools(directory)
  }

  get busy(): boolean { return Boolean(this.pending) }
  snapshot(): EditorRuntimeState | undefined { return this.state && { ...this.state } }
  environment(): NodeJS.ProcessEnv { return this.env ?? this.tools.environment() }

  ensure(project: EditorProject, retry = false): Promise<void> {
    if (this.pending) {
      if (this.state?.root !== project.root)
        return Promise.reject(new Error('请先取消上一个项目的安装。'))
      return this.pending
    }
    if (!retry && this.state?.root === project.root && ['error', 'cancelled'].includes(this.state.phase))
      return Promise.reject(new Error(this.state.message))
    const controller = new AbortController()
    this.controller = controller
    this.state = { root: project.root, phase: 'checking', message: '正在检测运行环境…', missing: [], log: '' }
    this.emit()
    const operation = async () => {
      let installed = false
      const report = (message: string) => {
        controller.signal.throwIfAborted()
        this.state = { ...this.state!, phase: 'installing', message: message.trim().split('\n').at(-1)?.slice(0, 250) || '正在安装…', log: (this.state!.log + message).slice(-16000) }
        this.timer ??= setTimeout(() => this.emit(), 100)
      }
      const tools = await (this.provision ?? this.tools.prepare.bind(this.tools))(project.root, !project.pluginProject && project.targets.native.enabled, { signal: controller.signal, report })
      controller.signal.throwIfAborted()
      this.env = tools.env
      const missing = await missingDependencies(project.root)
      controller.signal.throwIfAborted()
      this.state = { ...this.state!, missing }
      if (missing.length) {
        report(`正在安装项目依赖：${missing.slice(0, 8).join('、')}${missing.length > 8 ? '…' : ''}\n`)
        const frozen = Boolean(await stat(join(project.root, 'pnpm-lock.yaml')).catch(() => undefined))
        const manager = process.platform === 'win32' ? `${tools.manager}.cmd` : tools.manager
        await runTool(manager, dependencyInstallArguments(tools.manager, frozen), project.root, { signal: controller.signal, env: { ...this.env, CI: 'true', npm_config_ignore_scripts: 'true' }, report })
        installed = true
      }
      const remaining = await missingDependencies(project.root)
      controller.signal.throwIfAborted()
      if (remaining.length)
        throw new Error(`安装后仍缺少依赖或构建产物：${remaining.join('、')}。工作区包需先构建；请检查包管理器日志后重试。`)
      this.state = { ...this.state!, phase: 'ready', missing: [], dependenciesChanged: installed, message: installed ? '运行环境安装完成' : '运行环境已就绪' }
    }
    this.pending = operation().catch((error) => {
      this.state = { ...this.state!, phase: controller.signal.aborted ? 'cancelled' : 'error', message: controller.signal.aborted ? '安装已取消，可重试继续补齐。' : String(error).replace(/^Error: /, '').slice(-8000) }
      throw error
    }).finally(() => {
      this.pending = undefined
      this.controller = undefined
      this.emit()
    })
    return this.pending
  }

  async cancel(): Promise<void> {
    this.controller?.abort()
    await this.pending?.catch(() => {})
  }

  private emit(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.state)
      this.changed({ ...this.state })
  }
}
