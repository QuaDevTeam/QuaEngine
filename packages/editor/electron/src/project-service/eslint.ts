import type { EditorDiagnostic } from '@quajs/editor-core'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDocumentPath } from './documents.js'
import { MAX_DOCUMENT_BYTES } from './files.js'

const flatNames = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts']
const legacyNames = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc']
export const eslintSource = (path: string): boolean => /\.[cm]?[jt]sx?$/iu.test(path)
export const eslintWatchFile = (path: string): boolean => [...legacyNames, '.eslintignore'].includes(path.split(/[\\/]/u).at(-1) || '')
interface Config { path: string, flat: boolean }
interface LintMessage { ruleId: string | null, severity: number, message: string, line?: number, column?: number, endLine?: number, endColumn?: number }
interface Linter { lintText: (text: string, options: { filePath: string, warnIgnored: boolean }) => Promise<{ messages: LintMessage[] }[]> }
interface LinterConstructor { new(options: Record<string, unknown>): Linter, configType?: string }
interface ESLintModule { ESLint: LinterConstructor, loadESLint?: (options: { useFlatConfig: boolean }) => Promise<LinterConstructor> }

/** Runs only in disposable workers. Project configuration/plugins are executable tooling. */
export class ProjectESLint {
  private readonly configs = new Map<string, Promise<Config | undefined>>()
  private readonly linters = new Map<string, Promise<Linter>>()
  constructor(private readonly root: string) {}

  private async config(path: string): Promise<Config | undefined> {
    const directory = dirname(path)
    const cached = this.configs.get(directory)
    if (cached)
      return cached
    const pending = this.findConfig(directory)
    this.configs.set(directory, pending)
    return pending
  }

  private async findConfig(directory: string): Promise<Config | undefined> {
    let legacy: Config | undefined
    for (let current = directory; ; current = dirname(current)) {
      for (const name of [...flatNames, ...legacyNames, 'package.json']) {
        const path = join(current, name)
        const metadata = await stat(path).catch(() => undefined)
        if (!metadata?.isFile())
          continue
        const local = relative(this.root, await realpath(path))
        if (local.startsWith('..') || isAbsolute(local))
          throw new Error('ESLint 配置必须位于当前项目中。')
        if (name === 'package.json') {
          if (metadata.size > MAX_DOCUMENT_BYTES)
            continue
          const manifest = JSON.parse(await readFile(path, 'utf8')) as { eslintConfig?: unknown }
          if (!manifest.eslintConfig)
            continue
        }
        const config = { path, flat: flatNames.includes(name) }
        if (config.flat)
          return config
        legacy ??= config
      }
      if (current === this.root)
        return legacy
    }
  }

  private linter(config: Config): Promise<Linter> {
    let pending = this.linters.get(config.path)
    if (!pending) {
      pending = this.load(config)
      this.linters.set(config.path, pending)
    }
    return pending
  }

  private async load(config: Config): Promise<Linter> {
    const require = createRequire(join(this.root, 'package.json'))
    let entry: string
    try {
      entry = require.resolve('eslint')
    }
    catch { throw new Error('检测到 ESLint 配置，但项目未安装 eslint。请安装项目的开发依赖。') }
    const module = await import(/* @vite-ignore */ pathToFileURL(entry).href) as ESLintModule
    const ESLint = module.loadESLint
      ? await module.loadESLint({ useFlatConfig: config.flat })
      : config.flat ? (require('eslint/use-at-your-own-risk') as { FlatESLint: LinterConstructor }).FlatESLint : module.ESLint
    if (!ESLint || (!config.flat && ESLint.configType === 'flat'))
      throw new Error('此 ESLint 版本不支持 .eslintrc；请迁移到 eslint.config.*，或使用支持旧配置的项目 ESLint 版本。')
    return new ESLint({ cwd: this.root, overrideConfigFile: config.path, fix: false, cache: false })
  }

  async analyze(path: string, text: string): Promise<EditorDiagnostic[]> {
    if (!eslintSource(path))
      return []
    path = await resolveDocumentPath(this.root, path)
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_DOCUMENT_BYTES)
      throw new Error('文档超过 2 MB 编辑上限。')
    try {
      const config = await this.config(path)
      if (!config)
        return []
      const linter = await this.linter(config)
      const results = await linter.lintText(text, { filePath: path, warnIgnored: false })
      return results.flatMap(result => result.messages.filter(message => message.severity > 0).map(message => ({
        code: `ESLint/${message.ruleId || 'parse'}`,
        message: message.message,
        severity: message.severity === 2 ? 'error' as const : 'warning' as const,
        filePath: path,
        line: Math.max(1, message.line || 1),
        column: Math.max(1, message.column || 1),
        endLine: message.endLine,
        endColumn: message.endColumn,
      }))).slice(0, 1000)
    }
    catch (error) {
      return [{ code: 'ESLint/config', severity: 'warning', filePath: path, line: 1, column: 1, message: `ESLint 检查不可用：${error instanceof Error ? error.message : String(error)}` }]
    }
  }
}
