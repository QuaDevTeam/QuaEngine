import type {
  EditorPluginInstallEvent,
  EditorPublication,
  EditorPublishingState,
  EditorSourceEdit,
} from '@quajs/editor-core'
import type { ChildProcess } from 'node:child_process'
import type { RegistryService } from './service.js'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { gunzipSync } from 'node:zlib'
import {
  declaredPlugin,
  inspectTar,
  isExactPackageVersion,
  pluginRecord,
  validateEntrypoints,
} from '@quajs/editor-core'
import { readProjectDocument } from '../project-service/documents.js'
import { packageManager } from './installer.js'
import { pluginProject } from './project-info.js'
import { NPM_REGISTRY } from './registry.js'

interface Prepared {
  publication: EditorPublication
  directory: string
  path: string
  revision: string
}
export class PluginPublisher {
  private prepared?: Prepared
  private operation?: Promise<unknown>
  private child?: ChildProcess
  private generation = 0
  get busy(): boolean {
    return Boolean(this.operation)
  }

  constructor(
    private readonly profile: string,
    private readonly currentRoot: () => string | undefined,
    private readonly service: RegistryService,
    private readonly emit: (event: EditorPluginInstallEvent) => void,
  ) {}

  private assertRoot(root: string): void {
    if (!root || root !== this.currentRoot())
      throw new Error('项目已切换。')
  }

  async state(root: string): Promise<EditorPublishingState> {
    this.assertRoot(root)
    const project = await pluginProject(root)
    const registryUrl = await this.service.origin().catch(() => '')
    try {
      const account = await this.service.account()
      const submissions = account ? await this.service.submissions() : []
      return { project, registryUrl, account, submissions }
    }
    catch (error) {
      return {
        project,
        registryUrl,
        submissions: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async claim(root: string): Promise<EditorSourceEdit | undefined> {
    this.assertRoot(root)
    const project = await pluginProject(root)
    if (!project?.metadata || project.error)
      throw new Error(project?.error ?? '当前目录未声明 QuaEngine 插件。')
    const claim = await this.service.claim(project.name)
    this.assertRoot(root)
    if (!claim)
      return undefined
    const document = await readProjectDocument(root, 'package.json')
    const manifest = JSON.parse(document.text)
    if (manifest.name !== project.name)
      throw new Error('包名已变化。')
    manifest.quajs.registry = {
      ...pluginRecord(manifest.quajs.registry),
      claim,
    }
    return {
      root,
      path: document.path,
      revision: document.revision,
      start: 0,
      end: document.text.length,
      expectedText: document.text,
      newText: `${JSON.stringify(manifest, null, 2)}\n`,
    }
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.operation)
      throw new Error('发布操作正在进行。')
    const operation = action()
    this.operation = operation
    try {
      return await operation
    }
    finally {
      if (this.operation === operation)
        this.operation = undefined
    }
  }

  async prepare(root: string): Promise<EditorPublication> {
    return this.exclusive(async () => {
      this.assertRoot(root)
      const generation = ++this.generation
      await this.release()
      const document = await readProjectDocument(root, 'package.json')
      const manifest = JSON.parse(document.text)
      const metadata = declaredPlugin(manifest.name, manifest)
      if (!isExactPackageVersion(manifest.version))
        throw new Error('需要完整 npm 版本号。')
      await mkdir(join(this.profile, 'publish'), { recursive: true })
      const directory = await mkdtemp(join(this.profile, 'publish/package-'))
      try {
        const manager = await packageManager(root)
        if (generation !== this.generation)
          throw new Error('打包已取消。')
        await this.run(root, manifest.name, manager, [
          'pack',
          '--json',
          manager === 'pnpm'
            ? '--config.ignore-scripts=true'
            : '--ignore-scripts',
          '--pack-destination',
          directory,
        ])
        if (generation !== this.generation)
          throw new Error('打包已取消。')
        this.assertRoot(root)
        const files = (await readdir(directory)).filter(file =>
          file.endsWith('.tgz'),
        )
        if (files.length !== 1)
          throw new Error('没有唯一的 npm 打包产物。')
        const path = join(directory, files[0])
        if ((await stat(path)).size > 8 * 1024 * 1024)
          throw new Error('发布包超过 registry 的 8 MiB 上限。')
        const bytes = await readFile(path)
        if (bytes.length > 8 * 1024 * 1024)
          throw new Error('发布包超过 registry 的 8 MiB 上限。')
        const packed = inspectTar(
          new Uint8Array(
            gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }),
          ),
        )
        if (
          packed.manifest.name !== manifest.name
          || packed.manifest.version !== manifest.version
        ) {
          throw new Error('打包产物身份不一致。')
        }
        validateEntrypoints(packed.manifest, packed.files, manifest.name)
        if (
          JSON.stringify(declaredPlugin(manifest.name, packed.manifest))
          !== JSON.stringify(metadata)
        ) {
          throw new Error('打包产物的插件声明发生变化。')
        }
        if (packed.scan.flags.length) {
          throw new Error(
            `系统审核无法通过：${packed.scan.flags.join(', ')}。请检查后重新打包。`,
          )
        }
        const publishConfig = pluginRecord(packed.manifest.publishConfig)
        if (
          publishConfig?.registry
          && new URL(String(publishConfig.registry)).origin
          !== new URL(NPM_REGISTRY).origin
        ) {
          throw new Error('publishConfig.registry 必须为公开 npm。')
        }
        if (
          (await readProjectDocument(root, 'package.json')).revision
          !== document.revision
        ) {
          throw new Error('package.json 在打包期间发生变化，请重试。')
        }
        const publication: EditorPublication = {
          root,
          name: manifest.name,
          version: manifest.version,
          metadata,
          artifact: randomUUID(),
          integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
          bytes: bytes.length,
          files: [...packed.files].sort().slice(0, 300),
          fileCount: packed.files.size,
          registry: NPM_REGISTRY,
        }
        if (generation !== this.generation)
          throw new Error('打包已取消。')
        this.prepared = {
          publication,
          directory,
          path,
          revision: document.revision,
        }
        this.emit({
          root,
          name: manifest.name,
          phase: 'complete',
          message: '压缩包已生成，可以检查文件清单。',
        })
        return publication
      }
      catch (error) {
        this.emit({
          root,
          name: manifest.name,
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
        await rm(directory, { recursive: true, force: true })
        throw error
      }
    })
  }

  async publish(root: string, artifact: string, otp?: string): Promise<void> {
    return this.exclusive(async () => {
      this.assertRoot(root)
      const generation = ++this.generation
      const prepared = this.prepared
      if (
        !prepared
        || prepared.publication.root !== root
        || prepared.publication.artifact !== artifact
      ) {
        throw new Error('请先检查待发布压缩包。')
      }
      if (otp && !/^\d{6,10}$/.test(otp))
        throw new Error('npm 一次性验证码格式无效。')
      if (
        (await readProjectDocument(root, 'package.json')).revision
        !== prepared.revision
      ) {
        throw new Error('package.json 已变化，请重新打包检查。')
      }
      const bytes = await readFile(prepared.path)
      if (
        `sha512-${createHash('sha512').update(bytes).digest('base64')}`
        !== prepared.publication.integrity
      ) {
        throw new Error('待发布压缩包被修改。')
      }
      const tag = prepared.publication.version.includes('-')
        ? 'next'
        : 'latest'
      if (generation !== this.generation)
        throw new Error('发布已取消。')
      const scope = prepared.publication.name.startsWith('@')
        ? prepared.publication.name.split('/')[0]
        : undefined
      await this.run(
        root,
        prepared.publication.name,
        'npm',
        [
          'publish',
          prepared.path,
          '--ignore-scripts',
          '--access',
          'public',
          '--tag',
          tag,
          `--registry=${NPM_REGISTRY}`,
          ...(scope ? [`--${scope}:registry=${NPM_REGISTRY}`] : []),
        ],
        otp,
      )
      this.emit({
        root,
        name: prepared.publication.name,
        phase: 'complete',
        message: `已发布 ${prepared.publication.name}@${prepared.publication.version} 到 npm（${tag}）。`,
      })
      await this.release()
    })
  }

  async submit(root: string) {
    this.assertRoot(root)
    const project = await pluginProject(root)
    if (!project?.metadata)
      throw new Error('当前目录不是插件项目。')
    const result = await this.service.submit(project.name)
    this.assertRoot(root)
    return result
  }

  private async run(
    root: string,
    name: string,
    manager: 'npm' | 'pnpm',
    args: string[],
    otp?: string,
  ): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_ignore_scripts: 'true',
      ...(otp ? { npm_config_otp: otp } : {}),
    }
    delete env.NODE_OPTIONS
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(
      process.platform === 'win32' ? `${manager}.cmd` : manager,
      args,
      {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
      },
    )
    this.child = child
    this.emit({
      root,
      name,
      phase: 'installing',
      message: args[0] === 'pack' ? '正在生成 npm 压缩包…' : '正在发布到 npm…',
    })
    let output = ''
    const generation = this.generation
    const timeout = setTimeout(() => {
      void this.cancel()
    }, 180000)
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        const value = stripVTControlCharacters(String(chunk)).replaceAll(
          otp || '\0',
          '[OTP]',
        )
        output = (output + value).slice(-12000)
      })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', code =>
          generation !== this.generation
            ? reject(
                new Error(
                  '操作已取消；若 npm 已接收发布，请查询该版本后再操作。',
                ),
              )
            : code === 0
              ? resolve()
              : reject(new Error(`${manager} 失败（${code}）。${output}`)))
      })
    }
    catch (error) {
      this.emit({
        root,
        name,
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    finally {
      clearTimeout(timeout)
      if (this.child === child)
        this.child = undefined
    }
  }

  async cancel(): Promise<void> {
    this.generation++
    const child = this.child
    if (child?.pid) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          const killer = spawn('taskkill', [
            '/pid',
            String(child.pid),
            '/T',
            '/F',
          ])
          killer.once('error', () => resolve())
          killer.once('close', () => resolve())
        })
      }
      else {
        try {
          process.kill(-child.pid, 'SIGTERM')
        }
        catch {
          /* Exited. */
        }
        const pid = child.pid
        const timer = setTimeout(() => {
          try {
            process.kill(-pid, 'SIGKILL')
          }
          catch {
            /* Exited. */
          }
        }, 1000)
        await this.operation?.catch(() => {})
        clearTimeout(timer)
        try {
          process.kill(-pid, 'SIGKILL')
        }
        catch {
          /* Exited. */
        }
      }
    }
    await this.operation?.catch(() => {})
  }

  async release(): Promise<void> {
    const previous = this.prepared
    this.prepared = undefined
    if (previous)
      await rm(previous.directory, { recursive: true, force: true })
  }
}
