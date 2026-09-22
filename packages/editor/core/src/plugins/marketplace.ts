export interface QuaPluginMetadata {
  schemaVersion: 1
  id: string
  title: string
  runtime?: { entry: string }
  devtools?: {
    apiVersion: number
    entry: string
    export?: string
    indexer?: string
    indexerExport?: string
    style?: string
  }
}
export interface EditorInstalledPlugin {
  name: string
  version: string
  description: string
  metadata: QuaPluginMetadata
  enabled: boolean
  builtin?: boolean
  official?: boolean
  error?: string
}
export interface EditorPluginListing {
  official?: boolean
  reviewed?: boolean
  version?: string
  name: string
  title: string
  description: string
  tags: string[]
}
export interface EditorMarketplaceSnapshot {
  root: string
  installed: EditorInstalledPlugin[]
  catalog: EditorPluginListing[]
  catalogUrl: string
  registryUrl: string
  issues: string[]
}
export interface EditorPluginDetails extends EditorInstalledPlugin {
  integrity: string
  installable: boolean
}
export interface EditorPluginInstallEvent {
  root: string
  name: string
  phase: 'installing' | 'complete' | 'error' | 'cancelled'
  message: string
}
export interface EditorDevtoolsDescriptor {
  name: string
  version: string
  id: string
  title: string
  url: string
  export?: string
  styleUrl?: string
}
/** Private host-to-worker contract, never emitted to the workbench. */
export interface EditorPluginIndexerDescriptor {
  name: string
  version: string
  directory: string
  id: string
  entry: string
  export?: string
}

export function isNpmPackageName(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length <= 214
    && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
  )
}
export function isExactPackageVersion(value: unknown): value is string {
  return (
    typeof value === 'string'
    && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Z.-]+)?(?:\+[0-9A-Z.-]+)?$/i.test(
      value,
    )
    && value.length < 100
  )
}
export function pluginRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
export function pluginFile(
  value: unknown,
  extension = /\.m?js$/,
): value is string {
  return (
    typeof value === 'string'
    && value.length < 240
    && /^\.\/[\w./-]+$/.test(value)
    && !value
      .slice(2)
      .split('/')
      .some(part => !part || part === '.' || part === '..')
      && extension.test(value)
  )
}

export function parsePluginMetadata(
  name: string,
  manifest: unknown,
): QuaPluginMetadata | undefined {
  if (!isNpmPackageName(name))
    throw new Error('无效的 npm 包名。')
  const record = pluginRecord(manifest)
  const quajs = pluginRecord(record?.quajs)
  if (quajs?.type === 'core')
    return undefined
  const extension = pluginRecord(quajs?.extension)
  if (quajs?.extension !== undefined && !extension)
    throw new Error('无效的 quajs.extension 元数据。')
  if (!extension) {
    if (quajs?.type !== 'feature' && quajs?.type !== 'plugin')
      return undefined
    return {
      schemaVersion: 1,
      id: name.replace(/^@/, '').replace('/', '.'),
      title: name,
      runtime: { entry: '.' },
    }
  }
  if (
    extension.schemaVersion !== 1
    || typeof extension.id !== 'string'
    || !/^[a-z][a-z0-9.-]{0,95}$/.test(extension.id)
    || typeof extension.title !== 'string'
    || !extension.title.trim()
    || extension.title.length > 100
  ) {
    throw new Error('无效的 quajs.extension 元数据。')
  }
  const runtime = pluginRecord(extension.runtime)
  const devtools = pluginRecord(extension.devtools)
  if (
    (extension.runtime !== undefined && !runtime)
    || (extension.devtools !== undefined && !devtools)
  ) {
    throw new Error('无效的插件能力声明。')
  }
  if (!runtime && !devtools)
    throw new Error('插件必须声明 runtime 或 devtools。')
  if (
    runtime
    && (typeof runtime.entry !== 'string'
      || (runtime.entry !== '.' && !pluginFile(runtime.entry)))
  ) {
    throw new Error('无效的 runtime 入口。')
  }
  if (
    devtools
    && (!Number.isInteger(devtools.apiVersion)
      || !pluginFile(devtools.entry)
      || (devtools.indexer !== undefined && !pluginFile(devtools.indexer))
      || (devtools.style !== undefined && !pluginFile(devtools.style, /\.css$/)))
  ) {
    throw new Error('无效的 devtools 入口。')
  }
  for (const key of ['export', 'indexerExport']) {
    if (
      devtools?.[key] !== undefined
      && (typeof devtools[key] !== 'string'
        || !/^[a-z_$][\w$]*$/i.test(devtools[key] as string))
    ) {
      throw new Error('无效的 devtools 导出名。')
    }
  }
  return {
    schemaVersion: 1,
    id: extension.id,
    title: extension.title,
    ...(runtime ? { runtime: { entry: runtime.entry as string } } : {}),
    ...(devtools
      ? {
          devtools: {
            apiVersion: devtools.apiVersion as number,
            entry: devtools.entry as string,
            export: devtools.export as string | undefined,
            indexer: devtools.indexer as string | undefined,
            indexerExport: devtools.indexerExport as string | undefined,
            style: devtools.style as string | undefined,
          },
        }
      : {}),
  }
}
