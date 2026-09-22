import { parsePluginMetadata, pluginRecord } from './marketplace.js'

const decoder = new TextDecoder()
function fail(_status: number, code: string, message: string): never {
  throw new Error(`${code}: ${message}`)
}

export function declaredPlugin(name: string, manifest: unknown) {
  const record = pluginRecord(manifest)
  if (!pluginRecord(pluginRecord(record?.quajs)?.extension)) {
    fail(
      422,
      'plugin_declaration',
      '包必须明确声明 quajs.extension schemaVersion 1。',
    )
  }
  const metadata = parsePluginMetadata(name, manifest)
  if (!metadata)
    fail(422, 'plugin_declaration', '这不是可注册的 QuaEngine 插件。')
  if (record?.private)
    fail(422, 'private_package', '只接受公开 npm 包。')
  if (
    metadata.devtools
    && (metadata.devtools.apiVersion !== 1 || record?.type !== 'module')
  ) {
    fail(422, 'devtools_api', 'Devtools 必须为 ESM，且使用编辑器 API 1。')
  }
  const scripts = pluginRecord(record?.scripts)
  if (['preinstall', 'install', 'postinstall'].some(key => scripts?.[key]))
    fail(422, 'install_script', 'Registry 不接收带安装生命周期脚本的插件。')
  return metadata
}
function field(bytes: Uint8Array, start: number, length: number): string {
  return decoder
    .decode(bytes.subarray(start, start + length))
    .replace(/\0.*$/s, '')
}
/** Inspect tar entries without unpacking paths or executing any package code. */
export function inspectTar(bytes: Uint8Array): {
  files: Set<string>
  manifest: Record<string, unknown>
  scan: {
    flags: string[]
    evidence: { path: string, text: string }[]
    truncated: boolean
  }
} {
  let offset = 0
  let count = 0
  let paxPath = ''
  let manifest: Record<string, unknown> | undefined
  const files = new Set<string>()
  const flags = new Set<string>()
  const evidence: { path: string, text: string }[] = []
  let evidenceLength = 0
  let truncated = false
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) {
      if (bytes.subarray(offset).some(byte => byte !== 0))
        fail(422, 'tar_trailing', '压缩包结束标记后包含额外内容。')
      break
    }
    if (++count > 10000)
      fail(422, 'tar_limit', '包文件数超过 10000。')
    const rawSize = field(header, 124, 12).trim()
    if (!/^[0-7]+$/.test(rawSize))
      fail(422, 'tar_format', '不支持的 tar 大小字段。')
    const size = Number.parseInt(rawSize, 8)
    const expected = Number.parseInt(field(header, 148, 8).trim(), 8)
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    )
    if (
      checksum !== expected
      || offset + 512 + Math.ceil(size / 512) * 512 > bytes.length
    ) {
      fail(422, 'tar_format', '压缩包损坏。')
    }
    const body = bytes.subarray(offset + 512, offset + 512 + size)
    const type = field(header, 156, 1)
    const prefix = field(header, 345, 155)
    let path
      = paxPath || `${prefix ? `${prefix}/` : ''}${field(header, 0, 100)}`
    paxPath = ''
    offset += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') {
      let cursor = 0
      while (cursor < body.length) {
        const space = body.indexOf(32, cursor)
        const length = Number(decoder.decode(body.subarray(cursor, space)))
        if (
          space < cursor
          || !Number.isSafeInteger(length)
          || length < space - cursor + 3
          || cursor + length > body.length
        ) {
          fail(422, 'tar_format', '无效 PAX 条目。')
        }
        const entry = decoder.decode(
          body.subarray(space + 1, cursor + length - 1),
        )
        if (entry.startsWith('path='))
          paxPath = entry.slice(5)
        cursor += length
      }
      continue
    }
    if (type === 'L') {
      paxPath = decoder.decode(body).replace(/\0.*$/s, '')
      continue
    }
    path = path.replace(/\/$/, '')
    if (path === 'package' && type === '5')
      continue
    if (path.length > 2048 || Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      fail(422, 'tar_path', '压缩包路径无效。')
    if (
      !path.startsWith('package/')
      || path.includes('\\')
      || path.split('/').some(part => !part || part === '.' || part === '..')
    ) {
      fail(422, 'tar_path', '压缩包包含不安全路径。')
    }
    if (type === '5')
      continue
    if (type !== '' && type !== '0')
      fail(422, 'tar_link', '插件包不能包含符号链接或特殊文件。')
    const local = path.slice(8)
    if (files.has(local))
      fail(422, 'tar_duplicate', '包内路径重复。')
    files.add(local)
    if (
      /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|id_rsa|id_ed25519)$|\.(?:pem|key)$/i.test(
        local,
      )
    ) {
      flags.add('credential-file')
    }
    if (/\.(?:node|exe|dll|so|dylib)$/i.test(local))
      flags.add('native-executable')
    if (/\.[cm]?js$/i.test(local)) {
      if (size > 4 * 1024 * 1024)
        flags.add('script-size-limit')
      const text = decoder.decode(body.subarray(0, 4 * 1024 * 1024))
      if (/child_process|node:vm|\beval\s*\(|new\s+Function\s*\(/.test(text))
        flags.add('dynamic-execution')
      if (/\.npmrc|\.ssh|AWS_SECRET_ACCESS_KEY|NPM_TOKEN|id_rsa/.test(text))
        flags.add('credential-access')
      if (evidenceLength < 12000 && evidence.length < 12) {
        const excerpt = text.slice(0, Math.min(3000, 12000 - evidenceLength))
        evidence.push({ path: local, text: excerpt })
        evidenceLength += excerpt.length
        if (excerpt.length < text.length)
          truncated = true
      }
      else {
        truncated = true
      }
    }
    if (local === 'package.json') {
      if (size > 256 * 1024)
        fail(422, 'manifest_limit', 'package.json 过大。')
      manifest = pluginRecord(JSON.parse(decoder.decode(body)))
    }
  }
  if (!manifest)
    fail(422, 'tar_manifest', '压缩包缺少 package.json。')
  return { files, manifest, scan: { flags: [...flags], evidence, truncated } }
}
export function validateEntrypoints(
  manifest: Record<string, unknown>,
  files: Set<string>,
  name: string,
): void {
  const metadata = declaredPlugin(name, manifest)
  const required = [
    metadata.devtools?.entry,
    metadata.devtools?.indexer,
    metadata.devtools?.style,
  ].filter((path): path is string => Boolean(path))
  if (metadata.runtime) {
    let entry: unknown = metadata.runtime.entry
    if (entry === '.') {
      const exports = manifest.exports
      entry
        = typeof exports === 'string'
          ? exports
          : (pluginRecord(exports)?.['.'] ?? exports)
      for (let depth = 0; depth < 5 && pluginRecord(entry); depth++)
        entry = pluginRecord(entry)?.import ?? pluginRecord(entry)?.default
      entry ??= manifest.module ?? manifest.main ?? './index.js'
      if (typeof entry === 'string' && !entry.startsWith('./'))
        entry = `./${entry}`
    }
    if (typeof entry !== 'string') {
      fail(
        422,
        'runtime_entry',
        'Runtime 入口不能解析为导出的 JavaScript 文件。',
      )
    }
    required.push(entry)
  }
  for (const path of required) {
    if (
      !path.startsWith('./')
      || path
        .split('/')
        .slice(1)
        .some(part => !part || part === '.' || part === '..')
        || !files.has(path.slice(2))
    ) {
      fail(422, 'missing_entry', `打包产物缺少入口：${path}`)
    }
  }
}
