import type {
  EditorPluginListing,
  EditorPluginSubmission,
  EditorRegistryAccount,
} from '@quajs/editor-core'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isExactPackageVersion,
  isNpmPackageName,
  pluginRecord,
} from '@quajs/editor-core'
import { catalogEntries } from './registry.js'

export interface CredentialEncryption {
  available: () => boolean
  encrypt: (text: string) => Buffer
  decrypt: (bytes: Buffer) => string
}
export function serviceOrigin(value: string, allowLocal = false): string {
  if (!value)
    return ''
  const url = new URL(value)
  if (
    (url.protocol !== 'https:'
      && !(
        allowLocal
        && url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
  ) {
    throw new Error('Registry 地址须为 HTTPS 服务根地址。')
  }
  return url.origin
}
export class RegistryService {
  private polling?: Promise<EditorRegistryAccount | undefined>
  private pending?: { origin: string, code: string, expires: number }
  constructor(
    private readonly profile: string,
    private readonly getOrigin: () => Promise<string>,
    private readonly encryption: CredentialEncryption,
  ) {}

  async origin(): Promise<string> {
    const origin = await this.getOrigin()
    if (!origin)
      throw new Error('请先在目录源中配置 Plugin Registry 服务地址。')
    return origin
  }

  private credentialPath(origin: string): string {
    return join(
      this.profile,
      'registry-auth',
      `${createHash('sha256').update(origin).digest('hex')}.bin`,
    )
  }

  private async credential(origin: string): Promise<string | undefined> {
    if (!this.encryption.available())
      return undefined
    try {
      const text = this.encryption.decrypt(
        await readFile(this.credentialPath(origin)),
      )
      return /^[a-f0-9]{64}$/.test(text) ? text : undefined
    }
    catch {
      return undefined
    }
  }

  private async request(
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<Record<string, unknown>> {
    const origin = await this.origin()
    const credential = auth ? await this.credential(origin) : undefined
    if (auth && !credential)
      throw new Error('请先登录 Plugin Registry。')
    const response = await fetch(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const length = Number(response.headers.get('Content-Length') ?? 0)
    if (length > 2 * 1024 * 1024) {
      await response.body?.cancel()
      throw new Error('Registry 响应过大。')
    }
    const reader = response.body?.getReader()
    const chunks: Buffer[] = []
    let size = 0
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done)
            break
          size += value.length
          if (size > 2 * 1024 * 1024)
            throw new Error('Registry 响应过大。')
          chunks.push(Buffer.from(value))
        }
      }
      finally {
        await reader.cancel().catch(() => {})
      }
    }
    const data = pluginRecord(
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
    )
    if (!data || !response.ok) {
      throw new Error(
        typeof data?.message === 'string'
          ? data.message.slice(0, 1000)
          : `Registry 请求失败：${response.status}`,
      )
    }
    if (origin !== (await this.getOrigin()))
      throw new Error('Registry 配置已变化。')
    return data
  }

  async start(): Promise<{ userCode: string, expiresIn: number, url: string }> {
    if (!this.encryption.available())
      throw new Error('系统安全凭据存储不可用，暂时无法保存 Registry 登录。')
    const origin = await this.origin()
    const data = await this.request('/api/device/start', {}, false)
    if (
      typeof data.deviceCode !== 'string'
      || !/^[a-f0-9]{64}$/.test(data.deviceCode)
      || typeof data.userCode !== 'string'
      || !/^[A-F0-9]{10}$/.test(data.userCode)
    ) {
      throw new Error('无效 Registry 登录响应。')
    }
    this.pending = {
      origin,
      code: data.deviceCode,
      expires: Date.now() + 600000,
    }
    // Build the URL locally: remote JSON cannot send the host to an arbitrary site.
    return {
      userCode: data.userCode,
      expiresIn: 600,
      url: `${origin}/activate?code=${data.userCode}`,
    }
  }

  async poll(): Promise<EditorRegistryAccount | undefined> {
    if (this.polling)
      return this.polling
    const polling = this.performPoll()
    this.polling = polling
    try {
      return await polling
    }
    finally {
      if (this.polling === polling)
        this.polling = undefined
    }
  }

  private async performPoll(): Promise<EditorRegistryAccount | undefined> {
    const pending = this.pending
    if (
      !pending
      || pending.expires < Date.now()
      || pending.origin !== (await this.getOrigin())
    ) {
      this.pending = undefined
      throw new Error('登录请求已过期。')
    }
    const data = await this.request(
      '/api/device/token',
      { deviceCode: pending.code },
      false,
    )
    if (data.pending)
      return undefined
    const account = pluginRecord(data.account)
    if (
      typeof data.token !== 'string'
      || !/^[a-f0-9]{64}$/.test(data.token)
      || typeof account?.id !== 'string'
      || typeof account.login !== 'string'
    ) {
      throw new Error('Registry 登录响应无效。')
    }
    if (this.pending !== pending)
      throw new Error('登录请求已替换。')
    const path = this.credentialPath(pending.origin)
    await mkdir(join(this.profile, 'registry-auth'), { recursive: true })
    await writeFile(path, this.encryption.encrypt(data.token), { mode: 0o600 })
    this.pending = undefined
    return { id: account.id, login: account.login }
  }

  async account(): Promise<EditorRegistryAccount | undefined> {
    const origin = await this.getOrigin()
    if (!origin || !(await this.credential(origin)))
      return undefined
    const data = await this.request('/api/me')
    if (typeof data.id !== 'string' || typeof data.login !== 'string')
      throw new Error('Registry 账号响应无效。')
    return { id: data.id, login: data.login }
  }

  async logout(): Promise<void> {
    const origin = await this.getOrigin()
    this.pending = undefined
    await this.polling?.catch(() => {})
    if (!origin)
      return
    try {
      if (await this.credential(origin))
        await this.request('/api/logout', {})
    }
    finally {
      await rm(this.credentialPath(origin), { force: true })
    }
  }

  async claim(name: string): Promise<string | undefined> {
    const data = await this.request('/api/claims', { name })
    if (data.registered)
      return undefined
    if (typeof data.claim !== 'string' || !/^[a-f0-9]{64}$/.test(data.claim))
      throw new Error('Registry 认领响应无效。')
    return data.claim
  }

  private submission(value: unknown): EditorPluginSubmission {
    const data = pluginRecord(value)
    if (
      !isNpmPackageName(data?.name)
      || !isExactPackageVersion(data?.version)
      || !['pending', 'approved', 'rejected', 'suspended'].includes(
        String(data?.status),
      )
    ) {
      throw new Error('Registry 登记响应无效。')
    }
    return {
      name: data.name,
      version: data.version,
      status: data.status as EditorPluginSubmission['status'],
      reason:
        typeof data.reason === 'string'
          ? data.reason.slice(0, 2000)
          : undefined,
      official: data.official === true,
    }
  }

  async submit(name: string): Promise<EditorPluginSubmission> {
    return this.submission(await this.request('/api/submissions', { name }))
  }

  async submissions(): Promise<EditorPluginSubmission[]> {
    const data = await this.request('/api/submissions')
    if (!Array.isArray(data.packages) || data.packages.length > 100)
      throw new Error('Registry 登记列表无效。')
    return data.packages.map(value => this.submission(value))
  }

  async catalog(query = ''): Promise<EditorPluginListing[]> {
    const items: EditorPluginListing[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const data = await this.request(
        `/api/catalog?${new URLSearchParams({ q: query, after })}`,
        undefined,
        false,
      )
      if (data?.registry !== true)
        throw new Error('服务未提供 Registry 目录。')
      items.push(...catalogEntries(data, true))
      if (typeof data.next !== 'string' || !data.next || data.next === after)
        break
      after = data.next
    }
    return items
  }

  async approved(
    name: string,
  ): Promise<{ version: string, integrity: string, official: boolean }> {
    if (!isNpmPackageName(name))
      throw new Error('无效 npm 包名。')
    const data = await this.request(
      `/api/package?name=${encodeURIComponent(name)}`,
      undefined,
      false,
    )
    if (
      data?.name !== name
      || data.reviewed !== true
      || !isExactPackageVersion(data.version)
      || typeof data.integrity !== 'string'
    ) {
      throw new Error('此包尚未通过 Registry 审核。')
    }
    return {
      version: data.version,
      integrity: data.integrity,
      official: data.official === true,
    }
  }
}
