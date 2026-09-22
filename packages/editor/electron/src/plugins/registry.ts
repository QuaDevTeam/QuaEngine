import type {
  EditorPluginDetails,
  EditorPluginListing,
} from '@quajs/editor-core'
import {
  isExactPackageVersion,
  isNpmPackageName,
  parsePluginMetadata,
  pluginRecord,
} from '@quajs/editor-core'
import bundledCatalog from './catalog.json' with { type: 'json' }

export const NPM_REGISTRY = 'https://registry.npmjs.org/'

export function registryUrl(value = NPM_REGISTRY): string {
  const url = new URL(value)
  if (
    (url.protocol !== 'https:'
      && !(
        url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
      || url.username
      || url.password
      || url.search
      || url.hash
      || !/^[\w:/.[\]-]+$/.test(url.href)
  ) {
    throw new Error('无效的 npm registry 地址。')
  }
  return `${url.href.replace(/\/+$/, '')}/`
}

export function catalogEntries(value: unknown, trustedRegistry = false): EditorPluginListing[] {
  const data = pluginRecord(value)
  if (
    data?.schemaVersion !== 1
    || !Array.isArray(data.plugins)
    || data.plugins.length > 500
  ) {
    throw new Error('市场目录必须为 schemaVersion: 1，且最多包含 500 个插件。')
  }
  const names = new Set<string>()
  return data.plugins.map((value) => {
    const item = pluginRecord(value)
    if (!item || !isNpmPackageName(item.name) || names.has(item.name))
      throw new Error('市场目录包含无效或重复的包名。')
    names.add(item.name)
    return {
      name: item.name,
      official: trustedRegistry && data.registry === true && item.reviewed === true && item.official === true,
      reviewed: data.registry === true && item.reviewed === true,
      version: isExactPackageVersion(item.version) ? item.version : undefined,
      title:
        typeof item.title === 'string' ? item.title.slice(0, 100) : item.name,
      description:
        typeof item.description === 'string'
          ? item.description.slice(0, 600)
          : '',
      tags: Array.isArray(item.tags)
        ? item.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .slice(0, 8)
            .map(tag => tag.slice(0, 30))
        : [],
    }
  })
}

export function catalogUrl(value: string): string {
  if (!value)
    return ''
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('目录地址过长。')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('目录源须为不含凭证的 HTTPS JSON 地址。')
  return url.href
}

export async function boundedJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      response.status === 404
        ? '此包或版本尚未发布到公开 npm registry。'
        : `目录请求失败：HTTP ${response.status}`,
    )
  }
  const reader = response.body?.getReader()
  if (!reader)
    throw new Error('目录响应为空。')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      size += chunk.value.length
      if (size > 2 * 1024 * 1024)
        throw new Error('目录响应超过 2 MiB 上限。')
      chunks.push(chunk.value)
    }
  }
  finally {
    await reader.cancel().catch(() => {})
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export class PluginRegistry {
  readonly base: string
  constructor(
    private readonly readJson = boundedJson,
    base = NPM_REGISTRY,
  ) {
    this.base = registryUrl(base)
  }

  async catalog(url: string): Promise<EditorPluginListing[]> {
    return catalogEntries(
      url ? await this.readJson(catalogUrl(url)) : bundledCatalog,
    )
  }

  async details(
    name: string,
    version = 'latest',
  ): Promise<EditorPluginDetails> {
    if (
      !isNpmPackageName(name)
      || (version !== 'latest' && !isExactPackageVersion(version))
    ) {
      throw new Error('无效的包名或版本。')
    }
    const manifest = pluginRecord(
      await this.readJson(
        `${this.base}${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
      ),
    )
    if (
      manifest?.name !== name
      || !isExactPackageVersion(manifest.version)
      || (version !== 'latest' && manifest.version !== version)
    ) {
      throw new Error('npm 返回的包标识不匹配。')
    }
    const metadata = parsePluginMetadata(name, manifest)
    if (!metadata)
      throw new Error('这个 npm 包没有声明 QuaEngine 插件元数据。')
    const dist = pluginRecord(manifest.dist)
    if (
      typeof dist?.integrity !== 'string'
      || !/^sha(?:256|384|512)-[A-Za-z0-9+/]+=*$/.test(dist.integrity)
    ) {
      throw new Error('npm 包缺少受支持的完整性校验信息。')
    }
    const error
      = metadata.devtools && metadata.devtools.apiVersion !== 1
        ? `此 devtools 需要编辑器 API ${metadata.devtools.apiVersion}，当前为 1。`
        : undefined
    return {
      name,
      integrity: dist.integrity,
      version: manifest.version,
      description:
        typeof manifest.description === 'string'
          ? manifest.description.slice(0, 600)
          : '',
      metadata,
      enabled: false,
      installable: !error,
      error,
    }
  }
}
