import type { EditorPluginInstallEvent } from '@quajs/editor-core'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { isExactPackageVersion, isNpmPackageName } from '@quajs/editor-core'
import { registryUrl } from './registry.js'

export async function packageManager(root: string): Promise<'npm' | 'pnpm'> {
  let path = root
  for (let i = 0; i < 16; i++) {
    const manifest = await readFile(join(path, 'package.json'), 'utf8')
      .then(text => JSON.parse(text))
      .catch(() => ({}))
    if (typeof manifest.packageManager === 'string') {
      if (/^pnpm@\d/.test(manifest.packageManager))
        return 'pnpm'
      if (/^npm@\d/.test(manifest.packageManager))
        return 'npm'
      throw new Error('目前支持 npm 和 pnpm 项目；此项目声明了其他包管理器。')
    }
    if (await stat(join(path, 'pnpm-lock.yaml')).catch(() => undefined))
      return 'pnpm'
    if (await stat(join(path, 'package-lock.json')).catch(() => undefined))
      return 'npm'
    if (await stat(join(path, 'yarn.lock')).catch(() => undefined))
      throw new Error('请通过项目的 Yarn 工作流安装插件。')
    const parent = dirname(path)
    if (parent === path)
      break
    path = parent
  }
  return 'npm'
}

export function installArguments(
  manager: 'npm' | 'pnpm',
  name: string,
  version: string,
  development: boolean,
  registry: string,
): string[] {
  if (!isNpmPackageName(name) || !isExactPackageVersion(version))
    throw new Error('无效的安装请求。')
  const base = registryUrl(registry)
  const scope = name.startsWith('@') ? name.split('/')[0] : undefined
  return [
    manager === 'pnpm' ? 'add' : 'install',
    '--save-exact',
    '--ignore-scripts',
    ...(manager === 'npm' ? ['--no-audit', '--no-fund'] : []),
    development ? '--save-dev' : '--save-prod',
    `--registry=${base}`,
    ...(scope ? [`--${scope}:registry=${base}`] : []),
    `${name}@${version}`,
  ]
}

export class PluginInstaller {
  private child?: ChildProcess
  private stopped = false
  private completion?: Promise<void>
  get busy(): boolean {
    return Boolean(this.completion)
  }

  run(
    root: string,
    name: string,
    version: string,
    development: boolean,
    registry: string,
    emit: (event: EditorPluginInstallEvent) => void,
  ): Promise<void> {
    if (this.completion)
      throw new Error('已有插件安装正在进行。')
    this.stopped = false
    const operation = async () => {
      const manager = await packageManager(root)
      if (this.stopped)
        throw new Error('插件安装已取消。')
      const args = installArguments(
        manager,
        name,
        version,
        development,
        registry,
      )
      emit({
        root,
        name,
        phase: 'installing',
        message: `${manager} ${args.join(' ')}\n`,
      })
      const child = spawn(
        process.platform === 'win32' ? `${manager}.cmd` : manager,
        args,
        {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          shell: process.platform === 'win32',
          env: {
            ...process.env,
            CI: 'true',
            npm_config_ignore_scripts: 'true',
          },
        },
      )
      this.child = child
      const timeout = setTimeout(
        () => {
          void this.cancel()
        },
        5 * 60 * 1000,
      )
      let tail = ''
      for (const stream of [child.stdout, child.stderr]) {
        stream?.setEncoding('utf8')
        stream?.on('data', (value: string) => {
          // Strip terminal control sequences; retain bounded diagnostic output only.
          const message = stripVTControlCharacters(value).slice(-8000)
          tail = (tail + message).slice(-8000)
          emit({ root, name, phase: 'installing', message })
        })
      }
      try {
        await new Promise<void>((resolve, reject) => {
          child.once('error', reject)
          child.once('close', code =>
            this.stopped
              ? reject(
                  new Error(
                    '插件安装已取消；请检查包管理器可能已写入的依赖变更。',
                  ),
                )
              : code === 0
                ? resolve()
                : reject(new Error(`插件安装失败（${code}）。\n${tail}`)))
        })
      }
      finally {
        clearTimeout(timeout)
        this.child = undefined
      }
    }
    this.completion = operation().finally(() => {
      this.completion = undefined
    })
    return this.completion
  }

  async cancel(): Promise<void> {
    this.stopped = true
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
          /* The process may have exited already. */
        }
        const pid = child.pid
        const timer = setTimeout(() => {
          try {
            process.kill(-pid, 'SIGKILL')
          }
          catch {
            /* Reaped. */
          }
        }, 1200)
        await this.completion?.catch(() => {})
        clearTimeout(timer)
        try {
          process.kill(-pid, 'SIGKILL')
        }
        catch {
          /* Reaped. */
        }
      }
    }
    await this.completion?.catch(() => {})
  }
}
