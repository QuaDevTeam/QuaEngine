import type { RuntimeOperation } from './process.js'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { satisfies, valid } from 'semver'
import { packageManager } from '../plugins/installer.js'
import { runTool } from './process.js'

export async function fetchBytes(url: string, signal: AbortSignal, limit: number, progress: (bytes: number) => void = () => {}): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]), redirect: 'error' })
  if (!response.ok || !response.body)
    throw new Error(`下载失败（HTTP ${response.status}）：${url}`)
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.length
      if (size > limit)
        throw new Error('下载超过大小上限。')
      chunks.push(value)
      progress(size)
    }
  }
  finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}

export function verifyDownload(bytes: Uint8Array, checksums: string, filename: string): void {
  const line = checksums.split('\n').find(line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '').replace(/^\.\//, '') === filename)
  const expected = line?.trim().split(/\s+/)[0] ?? checksums.trim()
  if (!/^[a-f0-9]{64}$/i.test(expected) || createHash('sha256').update(bytes).digest('hex') !== expected.toLowerCase())
    throw new Error(`下载校验失败：${filename}`)
}

/** IDE-private installs; no profile edits, global npm installs or system Rust replacement. */
export class ManagedTools {
  constructor(private readonly directory: string) {}

  environment(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.ELECTRON_RUN_AS_NODE
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
    const originalPath = env[pathKey]
    if (pathKey !== 'PATH')
      delete env[pathKey]
    env.PATH = [join(this.directory, 'node', process.platform === 'win32' ? '' : 'bin'), join(this.directory, 'managers', 'node_modules/.bin'), originalPath].filter(Boolean).join(delimiter)
    return env
  }

  async prepare(root: string, native: boolean, operation: Omit<RuntimeOperation, 'env'>): Promise<{ env: NodeJS.ProcessEnv, manager: 'npm' | 'pnpm' }> {
    await mkdir(this.directory, { recursive: true })
    const env = this.environment()
    const op = { ...operation, env }
    const probe = async (command: string, args = ['--version']) => runTool(command, args, root, { ...op, report() {} }, 20_000).catch(() => {
      operation.signal.throwIfAborted()
      return ''
    })
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const nodeRange = typeof manifest.engines?.node === 'string' ? manifest.engines.node : '>=22.12.0'
    const node = (await probe('node')).trim()
    if (!valid(node) || !satisfies(node, nodeRange) || !await probe(process.platform === 'win32' ? 'npm.cmd' : 'npm')) {
      operation.report('正在下载 Node.js LTS…\n')
      await this.installNode(nodeRange, op)
    }
    const manager = await packageManager(root)
    if (manager === 'pnpm') {
      let requested = '11.0.9'
      for (let directory = root; ; directory = dirname(directory)) {
        const pkg = await readFile(join(directory, 'package.json'), 'utf8').then(JSON.parse).catch(() => ({}))
        if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@')) {
          requested = pkg.packageManager.slice(5).split('+')[0]
          if (!valid(requested))
            throw new Error('packageManager 中的 pnpm 必须声明完整版本号。')
          break
        }
        if (dirname(directory) === directory)
          break
      }
      if ((await probe(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')).trim() !== requested) {
        operation.report(`正在安装 pnpm ${requested}…\n`)
        await runTool(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', join(this.directory, 'managers'), '--ignore-scripts', '--no-audit', '--no-fund', `pnpm@${requested}`], this.directory, op)
      }
    }
    if (native) {
      // Prefer an existing working toolchain. Only set Cargo/Rustup homes for our own install.
      if (!await probe('cargo') || !await probe('rustc')) {
        env.CARGO_HOME = join(this.directory, 'cargo')
        env.RUSTUP_HOME = join(this.directory, 'rustup')
        env.PATH = `${join(env.CARGO_HOME, 'bin')}${delimiter}${env.PATH}`
        if (!await probe('cargo') || !await probe('rustc'))
          await this.installRust(op)
      }
      // Rust relies on platform SDKs/linkers. Report the actual missing prerequisite.
      if (process.platform === 'darwin') {
        await runTool('xcrun', ['--find', 'clang'], root, { ...op, report() {} }, 20_000).catch(async () => {
          operation.signal.throwIfAborted()
          await runTool('xcode-select', ['--install'], root, op, 20_000).catch(() => {})
          throw new Error('原生预览需要 Apple Command Line Tools，已请求系统安装。请完成系统安装窗口后点击重试；也可在终端运行 xcode-select --install。')
        })
      }
      if (process.platform === 'linux')
        await runTool('cc', ['--version'], root, { ...op, report() {} }, 20_000).catch(() => { throw new Error('原生预览需要系统 C 编译器和平台开发库；请安装 build-essential、pkg-config、ALSA 开发库后重试。') })
      const probeDirectory = join(this.directory, `native-check-${randomUUID()}`)
      await mkdir(probeDirectory)
      try {
        const source = join(probeDirectory, 'main.rs')
        await writeFile(source, 'fn main() {}\n')
        await runTool('rustc', [source, '-o', join(probeDirectory, process.platform === 'win32' ? 'probe.exe' : 'probe')], root, { ...op, report() {} }, 120_000)
      }
      catch (error) {
        operation.signal.throwIfAborted()
        throw new Error(`原生编译器或系统链接器不可用。${process.platform === 'win32' ? '请安装 Visual Studio Build Tools 的 C++ 桌面开发组件和 Windows SDK 后重试。' : '请完成系统开发工具安装后重试。'}\n${String(error)}`)
      }
      finally { await rm(probeDirectory, { recursive: true, force: true }) }
    }
    operation.signal.throwIfAborted()
    return { env, manager }
  }

  private async download(url: string, filename: string, op: RuntimeOperation, checksumsUrl: string): Promise<Uint8Array> {
    let reported = 0
    const bytes = await fetchBytes(url, op.signal, 160 * 1024 * 1024, (size) => {
      if (size - reported >= 4 * 1024 * 1024) {
        reported = size
        op.report(`${filename}：已下载 ${Math.round(size / 1024 / 1024)} MB\n`)
      }
    })
    const checksum = await fetchBytes(checksumsUrl, op.signal, 1024 * 1024)
    verifyDownload(bytes, Buffer.from(checksum).toString('utf8'), filename)
    return bytes
  }

  private async installNode(range: string, op: RuntimeOperation): Promise<void> {
    if (!['darwin', 'linux', 'win32'].includes(platform()) || !['arm64', 'x64'].includes(arch()))
      throw new Error('此平台需要手动安装符合项目 engines.node 的 Node.js。')
    const releases = JSON.parse(Buffer.from(await fetchBytes('https://nodejs.org/dist/index.json', op.signal, 2 * 1024 * 1024)).toString('utf8')) as { version: string, lts: string | false }[]
    const release = releases.find(item => item.lts && valid(item.version) && satisfies(item.version, range) && satisfies(item.version, '>=22.12.0'))
    if (!release)
      throw new Error(`没有满足 ${range} 的 Node.js LTS，请检查 engines.node。`)
    const directoryName = `node-${release.version}-${platform() === 'win32' ? 'win' : platform()}-${arch()}`
    const filename = `${directoryName}.${platform() === 'win32' ? 'zip' : 'tar.gz'}`
    const base = `https://nodejs.org/dist/${release.version}`
    const bytes = await this.download(`${base}/${filename}`, filename, op, `${base}/SHASUMS256.txt`)
    const staging = join(this.directory, `node-download-${randomUUID()}`)
    await mkdir(staging)
    try {
      const archive = join(staging, filename)
      await writeFile(archive, bytes, { flag: 'wx' })
      op.report('正在解压 Node.js…\n')
      if (process.platform === 'win32') {
        const extractEnv = { ...op.env, QUA_ARCHIVE: archive, QUA_EXTRACT: staging }
        await runTool('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:QUA_ARCHIVE -DestinationPath $env:QUA_EXTRACT'], staging, { ...op, env: extractEnv })
      }
      else {
        await runTool('tar', ['-xzf', archive, '-C', staging], staging, op)
      }
      op.signal.throwIfAborted()
      const binary = join(staging, directoryName, process.platform === 'win32' ? 'node.exe' : 'bin/node')
      await runTool(binary, ['--version'], staging, op, 20_000)
      const installed = join(this.directory, 'node')
      const old = join(staging, 'previous')
      if (await stat(installed).catch(() => undefined))
        await rename(installed, old)
      try {
        await rename(join(staging, directoryName), installed)
      }
      catch (error) {
        if (await stat(old).catch(() => undefined))
          await rename(old, installed)
        throw error
      }
    }
    finally { await rm(staging, { recursive: true, force: true }) }
  }

  private async installRust(op: RuntimeOperation): Promise<void> {
    const triples: Record<string, string> = {
      'darwin-arm64': 'aarch64-apple-darwin',
      'darwin-x64': 'x86_64-apple-darwin',
      'linux-arm64': 'aarch64-unknown-linux-gnu',
      'linux-x64': 'x86_64-unknown-linux-gnu',
      'win32-x64': 'x86_64-pc-windows-msvc',
      'win32-arm64': 'aarch64-pc-windows-msvc',
    }
    const target = triples[`${platform()}-${arch()}`]
    if (!target)
      throw new Error('此平台需要手动安装 Rust 工具链。')
    const filename = process.platform === 'win32' ? 'rustup-init.exe' : 'rustup-init'
    const url = `https://static.rust-lang.org/rustup/dist/${target}/${filename}`
    op.report('正在下载 Rust 安装器…\n')
    const bytes = await this.download(url, filename, op, `${url}.sha256`)
    const staging = join(this.directory, `rust-download-${randomUUID()}`)
    await mkdir(staging)
    const installer = join(staging, filename)
    await writeFile(installer, bytes, { flag: 'wx' })
    try {
      await chmod(installer, 0o700)
      op.report('正在安装 Rust / Cargo（minimal）…\n')
      await runTool(installer, ['-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'stable'], this.directory, op)
      await runTool('cargo', ['--version'], this.directory, op, 20_000)
      await runTool('rustc', ['--version'], this.directory, op, 20_000)
    }
    finally { await rm(staging, { recursive: true, force: true }) }
  }
}
