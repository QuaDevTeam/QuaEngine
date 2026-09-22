import type {
  EditorDevtoolsDescriptor,
  EditorInstalledPlugin,
  EditorMarketplaceSnapshot,
  EditorPluginIndexerDescriptor,
  EditorPluginInstallEvent,
} from '@quajs/editor-core'
import type { CredentialEncryption } from './service.js'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  isExactPackageVersion,
  isNpmPackageName,
  pluginRecord,
} from '@quajs/editor-core'
import { installedPlugins, packageFile, readPackageJson } from './installed.js'
import { PluginInstaller } from './installer.js'
import { catalogUrl, PluginRegistry } from './registry.js'
import { RegistryService, serviceOrigin } from './service.js'

interface Preferences {
  registryUrl: string
  catalogUrl: string
  enabled: Record<string, Record<string, string>>
}
export class PluginManager {
  readonly service: RegistryService
  readonly installer = new PluginInstaller()
  private readonly grants = new Map<
    string,
    { root: string, directory: string, name: string, version: string }
  >()

  private installGeneration = 0
  private activeRoot = ''
  private readonly errors = new Map<string, string>()
  private cached?: {
    key: string
    devtools: EditorDevtoolsDescriptor[]
    indexers: EditorPluginIndexerDescriptor[]
  }

  private preferences?: Preferences
  constructor(
    private readonly profile: string,
    readonly registry = new PluginRegistry(),
    private readonly emit: (event: EditorPluginInstallEvent) => void = () => {},
    encryption: CredentialEncryption = {
      available: () => false,
      encrypt: () => {
        throw new Error('Credential storage unavailable')
      },
      decrypt: () => {
        throw new Error('Credential storage unavailable')
      },
    },
    private readonly defaultRegistry = '',
  ) {
    this.service = new RegistryService(
      profile,
      () => this.registryOrigin(),
      encryption,
    )
  }

  setProject(root: string): void {
    if (root !== this.activeRoot) {
      this.activeRoot = root
      this.grants.clear()
      this.cached = undefined
      this.errors.clear()
    }
  }

  async marketplace(
    root: string,
    query = '',
  ): Promise<EditorMarketplaceSnapshot> {
    this.assertProject(root)
    const preferences = await this.settings()
    const { packages, issues } = await installedPlugins(root)
    const enabled = preferences.enabled[this.key(root)] ?? {}
    const installed: EditorInstalledPlugin[] = packages
      .filter(item => !['@quajs/editor-character', '@quajs/editor-animation', '@quajs/editor-novel-writer'].includes(item.name))
      .map(({ directory: _directory, ...item }) => ({
        ...item,
        enabled: enabled[item.name] === item.version,
        error:
          this.errors.get(item.name)
          ?? (item.metadata.devtools && item.metadata.devtools.apiVersion !== 1
            ? `需要编辑器 API ${item.metadata.devtools.apiVersion}`
            : undefined),
      }))
    installed.unshift({
      name: '@quajs/editor-character',
      version: '0.1.0',
      description: '角色与差分源码浏览器',
      metadata: {
        schemaVersion: 1,
        id: 'qua.character',
        title: 'Character Browser',
        devtools: { apiVersion: 1, entry: './dist/index.js' },
      },
      enabled: true,
      builtin: true,
    })
    installed.unshift({ name: '@quajs/editor-animation', version: '0.1.0', description: '可视化关键帧时间轴与 Web renderer 预览', metadata: { schemaVersion: 1, id: 'qua.animation', title: 'Animation Editor', devtools: { apiVersion: 1, entry: './dist/index.js' } }, enabled: true, builtin: true })
    installed.unshift({ name: '@quajs/editor-novel-writer', version: '0.1.0', description: '项目 AI 写作、Story Tree 设定提取与 QS 联动编辑', metadata: { schemaVersion: 1, id: 'qua.novel-writer', title: 'Novel Writer', devtools: { apiVersion: 1, entry: './dist/editor/index.js' } }, enabled: true, builtin: true })
    let catalog: EditorMarketplaceSnapshot['catalog'] = []
    try {
      catalog = preferences.catalogUrl
        ? await this.registry.catalog(preferences.catalogUrl)
        : (await this.registryOrigin())
            ? await this.service.catalog(query)
            : await this.registry.catalog('')
    }
    catch (error) {
      issues.push(
        `目录加载失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (typeof query !== 'string' || query.length > 300)
      throw new Error('搜索文本过长。')
    if (query.trim()) {
      const needle = query.trim().toLocaleLowerCase()
      catalog = catalog.filter(item =>
        `${item.name} ${item.title} ${item.description} ${item.tags.join(' ')}`
          .toLocaleLowerCase()
          .includes(needle),
      )
      if (
        isNpmPackageName(query.trim())
        && !catalog.some(item => item.name === query.trim())
      ) {
        catalog.unshift({
          name: query.trim(),
          title: query.trim(),
          description: '在 npm 中查找这个包',
          tags: [],
        })
      }
    }
    this.assertProject(root)
    for (const item of installed) {
      item.official
        = item.builtin
          || catalog.some(entry => entry.name === item.name && entry.official)
    }
    return {
      registryUrl: await this.registryOrigin(),
      root,
      installed,
      catalog,
      catalogUrl: preferences.catalogUrl,
      issues,
    }
  }

  async details(root: string, name: string) {
    this.assertProject(root)
    const approved = (await this.registryOrigin())
      ? await this.service.approved(name)
      : undefined
    const result = await this.registry.details(name, approved?.version)
    if (approved && result.integrity !== approved.integrity)
      throw new Error('npm 完整性与 Registry 审核版本不匹配。')
    result.official = approved?.official ?? false
    this.assertProject(root)
    return result
  }

  async registryOrigin(): Promise<string> {
    return (await this.settings()).registryUrl || this.defaultRegistry
  }

  async configureRegistry(url: string): Promise<void> {
    const value = serviceOrigin(url)
    const preferences = await this.settings()
    preferences.registryUrl = value
    await this.persist()
  }

  async configureCatalog(url: string): Promise<void> {
    const value = catalogUrl(url)
    if (value)
      await this.registry.catalog(value)
    const preferences = await this.settings()
    preferences.catalogUrl = value
    await this.persist()
  }

  async enable(root: string, name: string, enabled: boolean): Promise<void> {
    this.assertProject(root)
    if (
      typeof enabled !== 'boolean'
      || !isNpmPackageName(name)
      || ['@quajs/editor-character', '@quajs/editor-animation', '@quajs/editor-novel-writer'].includes(name)
    ) {
      throw new Error('无效的插件启用请求。')
    }
    const { packages } = await installedPlugins(root)
    const item = packages.find(item => item.name === name)
    if (!item?.metadata.devtools || item.metadata.devtools.apiVersion !== 1)
      throw new Error('此插件未安装，或 devtools API 不兼容。')
    if (enabled) {
      if (
        packages.some(
          other =>
            other.name !== name
            && other.metadata.id === item.metadata.id
            && this.preferences?.enabled[this.key(root)]?.[other.name]
            === other.version,
        )
      ) {
        throw new Error('另一个已启用插件使用了相同标识。')
      }
      if (['qua.character', 'qua.animation', 'qua.novel-writer'].includes(item.metadata.id))
        throw new Error('插件标识与内置角色浏览器冲突。')
      await packageFile(item.directory, item.metadata.devtools.entry)
      if (item.metadata.devtools.indexer)
        await packageFile(item.directory, item.metadata.devtools.indexer)
      if (item.metadata.devtools.style)
        await packageFile(item.directory, item.metadata.devtools.style)
    }
    const preferences = await this.settings()
    this.assertProject(root)
    const values = (preferences.enabled[this.key(root)] ??= {})
    if (enabled)
      values[name] = item.version
    else delete values[name]
    await this.persist()
    this.cached = undefined
  }

  async install(root: string, name: string, version: string): Promise<void> {
    this.assertProject(root)
    const generation = ++this.installGeneration
    const approved = (await this.registryOrigin())
      ? await this.service.approved(name)
      : undefined
    if (approved && approved.version !== version)
      throw new Error('Registry 审核版本已经变化，请刷新后安装。')
    const details = await this.registry.details(name, version)
    if (approved && details.integrity !== approved.integrity)
      throw new Error('npm 完整性与 Registry 审核版本不匹配。')
    if (generation !== this.installGeneration)
      throw new Error('插件安装已取消。')
    if (!details.installable)
      throw new Error(details.error ?? '插件不兼容。')
    this.assertProject(root)
    try {
      await this.installer.run(
        root,
        name,
        version,
        !details.metadata.runtime,
        this.registry.base,
        this.emit,
      )
      if (generation !== this.installGeneration)
        throw new Error('插件安装已取消。')
      const { packages } = await installedPlugins(root)
      const installed = packages.find(
        item => item.name === name && item.version === version,
      )
      if (
        !installed
        || JSON.stringify(installed.metadata) !== JSON.stringify(details.metadata)
      ) {
        throw new Error(
          '安装结果与已选择的插件版本或元数据不匹配，请检查依赖变更。',
        )
      }
      if (details.metadata.devtools)
        await this.enable(root, name, true)
      this.emit({ root, name, phase: 'complete', message: '安装完成。' })
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
  }

  async cancel(): Promise<void> {
    this.installGeneration++
    await this.installer.cancel()
  }

  async active(root: string): Promise<{
    devtools: EditorDevtoolsDescriptor[]
    indexers: EditorPluginIndexerDescriptor[]
  }> {
    this.assertProject(root)
    const { packages } = await installedPlugins(root)
    const preferences = await this.settings()
    const enabled = preferences.enabled[this.key(root)] ?? {}
    const selected = packages
      .filter(
        item =>
          item.metadata.devtools?.apiVersion === 1
          && enabled[item.name] === item.version
          && !['qua.character', 'qua.animation', 'qua.novel-writer'].includes(item.metadata.id),
      )
      .slice(0, 16)
    const key = JSON.stringify([
      root,
      selected.map(item => [
        item.name,
        item.version,
        item.directory,
        item.metadata,
      ]),
    ])
    if (this.cached?.key === key)
      return this.cached
    const devtools: EditorDevtoolsDescriptor[] = []
    const indexers: EditorPluginIndexerDescriptor[] = []
    const grants = new Map<
      string,
      { root: string, directory: string, name: string, version: string }
    >()
    const ids = new Set<string>()
    this.errors.clear()
    for (const item of selected) {
      try {
        if (ids.has(item.metadata.id))
          throw new Error(`重复的 devtools 标识：${item.metadata.id}`)
        const metadata = item.metadata.devtools!
        await packageFile(item.directory, metadata.entry)
        const indexerEntry = metadata.indexer
          ? await packageFile(item.directory, metadata.indexer)
          : undefined
        if (metadata.style)
          await packageFile(item.directory, metadata.style)
        ids.add(item.metadata.id)
        const token = randomUUID()
        grants.set(token, {
          root,
          directory: item.directory,
          name: item.name,
          version: item.version,
        })
        const url = (path: string) => `qua-plugin://${token}/${path.slice(2)}`
        devtools.push({
          name: item.name,
          version: item.version,
          id: item.metadata.id,
          title: item.metadata.title,
          url: url(metadata.entry),
          export: metadata.export,
          styleUrl: metadata.style ? url(metadata.style) : undefined,
        })
        if (indexerEntry) {
          indexers.push({
            name: item.name,
            version: item.version,
            directory: item.directory,
            id: item.metadata.id,
            entry: indexerEntry,
            export: metadata.indexerExport,
          })
        }
      }
      catch (error) {
        this.errors.set(
          item.name,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    this.assertProject(root)
    this.grants.clear()
    for (const [key, grant] of grants) this.grants.set(key, grant)
    this.cached = { key, devtools, indexers }
    return this.cached
  }

  async resource(url: string): Promise<Response> {
    try {
      const parsed = new URL(url)
      const grant = this.grants.get(parsed.hostname)
      if (
        !grant
        || grant.root !== this.activeRoot
        || parsed.search
        || parsed.hash
      ) {
        return new Response(null, { status: 404 })
      }
      const manifest = await readPackageJson(
        join(grant.directory, 'package.json'),
      )
      if (manifest.name !== grant.name || manifest.version !== grant.version)
        return new Response(null, { status: 404 })
      const extension = extname(parsed.pathname)
      const mime: Record<string, string> = {
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }
      if (!mime[extension])
        return new Response(null, { status: 403 })
      const path = await packageFile(
        grant.directory,
        `.${decodeURIComponent(parsed.pathname)}`,
      )
      const bytes = await readFile(path)
      if (
        bytes.length > 8 * 1024 * 1024
        || grant.root !== this.activeRoot
        || this.grants.get(parsed.hostname) !== grant
      ) {
        return new Response(null, { status: 404 })
      }
      return new Response(bytes, {
        headers: {
          'Content-Type': mime[extension],
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    catch {
      return new Response(null, { status: 404 })
    }
  }

  private key(root: string): string {
    return createHash('sha256').update(root).digest('hex')
  }

  private assertProject(root: string): void {
    if (!root || root !== this.activeRoot)
      throw new Error('项目已切换。')
  }

  private async settings(): Promise<Preferences> {
    if (this.preferences)
      return this.preferences
    const text = await readFile(
      join(this.profile, 'plugins.json'),
      'utf8',
    ).catch(() => '')
    try {
      if (text.length > 256 * 1024)
        throw new Error('Preference limit')
      const value = pluginRecord(JSON.parse(text))
      const enabled: Preferences['enabled'] = Object.create(null)
      for (const [root, packages] of Object.entries(
        pluginRecord(value?.enabled) ?? {},
      )) {
        if (!/^[a-f0-9]{64}$/.test(root))
          continue
        enabled[root] = Object.create(null)
        for (const [name, version] of Object.entries(
          pluginRecord(packages) ?? {},
        )) {
          if (isNpmPackageName(name) && isExactPackageVersion(version))
            enabled[root][name] = version
        }
      }
      this.preferences = {
        registryUrl:
          typeof value?.registryUrl === 'string'
            ? serviceOrigin(value.registryUrl)
            : '',
        catalogUrl:
          typeof value?.catalogUrl === 'string'
            ? catalogUrl(value.catalogUrl)
            : '',
        enabled,
      }
    }
    catch {
      this.preferences = { registryUrl: '', catalogUrl: '', enabled: {} }
    }
    return this.preferences
  }

  private async persist(): Promise<void> {
    await mkdir(this.profile, { recursive: true })
    const temporary = join(this.profile, `plugins-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify(this.preferences, null, 2))
      await rename(temporary, join(this.profile, 'plugins.json'))
    }
    finally {
      await rm(temporary, { force: true })
    }
  }
}
