import type { Candidate, Network } from './types'
import {
  declaredPlugin,
  inspectTar,
  isExactPackageVersion,
  isNpmPackageName,
  pluginRecord,
  validateEntrypoints,
} from '@quajs/editor-core'
import { boundedBytes, fail, hash, HttpError } from './http'

export const NPM = 'https://registry.npmjs.org/'
export const MAX_TARBALL = 8 * 1024 * 1024
export const MAX_UNPACKED = 32 * 1024 * 1024
const decoder = new TextDecoder()
export class NpmSource {
  constructor(private readonly network: Network = fetch) {
    this.network = network.bind(globalThis)
  }

  async fetch(name: string, previous?: Candidate): Promise<Candidate> {
    if (!isNpmPackageName(name))
      fail(400, 'package_name', '无效 npm 包名。')
    const response = await this.network(
      `${NPM}${encodeURIComponent(name)}/latest`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json' },
      },
    )
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 404)
        fail(422, 'npm_unpublished', '该包尚未公开发布到 npm，或已被撤回。')
      fail(502, 'npm_unavailable', 'npm 暂时不可用。')
    }
    const manifest = pluginRecord(
      JSON.parse(decoder.decode(await boundedBytes(response, 512 * 1024))),
    )
    if (manifest?.name !== name || !isExactPackageVersion(manifest.version))
      fail(422, 'npm_identity', 'npm 包身份或版本不匹配。')
    if (manifest.deprecated)
      fail(422, 'npm_deprecated', 'npm 已将此包标记为弃用。')
    let metadata: ReturnType<typeof declaredPlugin>
    try {
      metadata = declaredPlugin(name, manifest)
    }
    catch (error) {
      fail(
        422,
        'plugin_declaration',
        error instanceof Error ? error.message : String(error),
      )
    }
    const dist = pluginRecord(manifest.dist)
    if (
      typeof dist?.integrity !== 'string'
      || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(dist.integrity)
    ) {
      fail(422, 'integrity', 'npm 包必须提供 SHA-512 完整性校验。')
    }
    if (typeof dist.tarball !== 'string')
      fail(422, 'tarball_url', 'npm 未提供压缩包。')
    const tarball = new URL(dist.tarball)
    if (
      tarball.origin !== new URL(NPM).origin
      || tarball.username
      || tarball.password
      || tarball.hash
      || tarball.search
      || !tarball.pathname.endsWith('.tgz')
    ) {
      fail(422, 'tarball_url', '只接受 registry.npmjs.org 上的 npm 压缩包。')
    }
    const ownershipResponse = await this.network(
      `${NPM}${encodeURIComponent(name)}`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json' },
      },
    )
    if (!ownershipResponse.ok) {
      await ownershipResponse.body?.cancel()
      fail(502, 'npm_ownership', '无法读取 npm 当前维护者。')
    }
    const ownership = pluginRecord(
      JSON.parse(
        decoder.decode(await boundedBytes(ownershipResponse, 4 * 1024 * 1024)),
      ),
    )
    if (ownership?.name !== name)
      fail(422, 'npm_identity', 'npm 维护者元数据身份不匹配。')
    const maintainers = Array.isArray(ownership.maintainers)
      ? ownership.maintainers
          .map(item => pluginRecord(item)?.name)
          .filter(
            (name): name is string =>
              typeof name === 'string' && name.length < 100,
          )
          .sort()
      : []
    if (!maintainers.length || maintainers.length > 100)
      fail(422, 'maintainers', '缺少有效 npm 维护者信息。')
    if (
      previous?.version === manifest.version
      && previous.integrity !== dist.integrity
    ) {
      fail(422, 'immutable_version', '相同版本的 npm 完整性信息发生变化。')
    }
    let scan = previous?.scan ?? { flags: [], evidence: [], truncated: false }
    // Reuse previously verified immutable tarballs; changed releases are always inspected.
    if (
      previous?.version !== manifest.version
      || previous.integrity !== dist.integrity
      || JSON.stringify(previous.metadata) !== JSON.stringify(metadata)
      || previous.claim
      !== (pluginRecord(pluginRecord(manifest.quajs)?.registry)?.claim ?? '')
    ) {
      const archive = await this.network(tarball.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      if (!archive.ok)
        fail(502, 'npm_tarball', '无法读取 npm 压缩包。')
      const compressed = await boundedBytes(archive, MAX_TARBALL)
      const digest = btoa(
        String.fromCharCode(
          ...new Uint8Array(await crypto.subtle.digest('SHA-512', compressed)),
        ),
      )
      if (`sha512-${digest}` !== dist.integrity)
        fail(422, 'integrity', 'npm 压缩包完整性校验失败。')
      let bytes: Uint8Array
      try {
        bytes = await boundedBytes(
          new Response(
            new Blob([compressed])
              .stream()
              .pipeThrough(new DecompressionStream('gzip')),
          ),
          MAX_UNPACKED,
        )
      }
      catch (error) {
        if (error instanceof HttpError)
          throw error
        fail(422, 'tar_format', '无法解压 npm 包。')
      }
      try {
        const packed = inspectTar(bytes)
        scan = packed.scan
        if (
          packed.manifest.name !== name
          || packed.manifest.version !== manifest.version
          || JSON.stringify(declaredPlugin(name, packed.manifest))
          !== JSON.stringify(metadata)
        ) {
          fail(422, 'tar_identity', 'npm 元数据与实际压缩包不一致。')
        }
        const packedClaim = pluginRecord(
          pluginRecord(packed.manifest.quajs)?.registry,
        )?.claim
        const claim = pluginRecord(
          pluginRecord(manifest.quajs)?.registry,
        )?.claim
        if (packedClaim !== claim)
          fail(422, 'claim_mismatch', '压缩包与 npm 元数据的认领声明不一致。')
        validateEntrypoints(packed.manifest, packed.files, name)
      }
      catch (error) {
        if (error instanceof HttpError)
          throw error
        fail(
          422,
          'package_validation',
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    const claim = pluginRecord(pluginRecord(manifest.quajs)?.registry)?.claim
    const value = {
      scan,
      name,
      version: manifest.version,
      title: metadata.title,
      description:
        typeof manifest.description === 'string'
          ? manifest.description.slice(0, 600)
          : '',
      metadata,
      integrity: dist.integrity,
      tarball: tarball.href,
      maintainers,
      capabilityHash: await hash(
        JSON.stringify({
          id: metadata.id,
          runtime: metadata.runtime,
          devtools: metadata.devtools,
          maintainers,
        }),
      ),
      claim:
        typeof claim === 'string' && /^[a-f0-9]{64}$/.test(claim) ? claim : '',
    }
    return { ...value, hash: await hash(JSON.stringify(value)) }
  }
}
