import type {
  AssetInfo,
  AssetType,
  BundleManifest,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  RuntimeLocalePackTargetManifest,
  RuntimePackageManifest,
  RuntimePackageScriptManifest,
  VersionCompatibility,
} from '../core/types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { compileLocalizedQuaScriptModuleToTs } from '@quajs/script-compiler'
import { isValidSemverVersion } from '@quajs/utils'
import ts from 'typescript'
import { AssetDetector } from '../assets/asset-detector'
import { MetadataGenerator } from '../assets/metadata'
import { QPKBundler } from '../bundlers/qpk-bundler'

export interface LocalePackBuildOptions {
  source: string
  base: string
  baseSource?: string
  locale: string
  targets: RuntimeLocalePackTargetManifest[]
  output: string
  packageId?: string
  version?: string
  priority?: number
  compatibility?: VersionCompatibility
  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }
  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string
  }
  ignore?: string[]
  signature?: RuntimePackageManifest['signature']
}

export interface LocalePackBuildResult {
  output: string
  manifest: BundleManifest
  assets: AssetInfo[]
}

interface CompiledLocaleAssets {
  assets: AssetInfo[]
  scripts: RuntimePackageScriptManifest[]
}

export async function buildLocalePack(options: LocalePackBuildOptions): Promise<LocalePackBuildResult> {
  const locale = normalizeLocale(options.locale)
  const source = resolve(options.source)
  const output = resolve(options.output)
  const baseManifest = await readBaseManifest(resolve(options.base))
  const compatibility = resolveLocalePackCompatibility(options.compatibility, baseManifest.runtimePackage?.compatibility || baseManifest.compatibility)
  const detector = new AssetDetector(options.ignore || [])
  const sourceAssets = await detector.discoverAssets(source)
  const baseSourceAssets = options.baseSource
    ? await detector.discoverAssets(resolve(options.baseSource))
    : []
  const baseCandidates = [...baseSourceAssets, ...sourceAssets]
  const localeSourceAssets = sourceAssets.filter(asset => asset.locales.map(normalizeLocale).includes(locale))
  const compiled = await compileLocaleAssets(localeSourceAssets, baseCandidates, baseManifest, locale, source, options.version)
  const assets = compiled.assets.filter(asset => !baseManifestHasSameLocaleAsset(baseManifest, asset, locale))

  if (assets.length === 0) {
    throw new Error(`No changed localized assets found for locale "${locale}".`)
  }

  const resourceTypes = unique(assets.map(asset => asset.type))
  const runtimePackage = createLocaleRuntimePackage({
    baseManifest,
    locale,
    options,
    resourceTypes,
    scripts: compiled.scripts.filter(script =>
      assets.some(asset => asset.type === 'scripts' && stableAssetKey(asset, locale) === script.assetName),
    ),
  })
  const compression = {
    algorithm: options.compression?.algorithm || 'none' as CompressionAlgorithm,
    level: options.compression?.level ?? 0,
  }
  const encryption = {
    enabled: options.encryption?.enabled ?? false,
    algorithm: options.encryption?.enabled ? options.encryption?.algorithm || 'xor' as EncryptionAlgorithm : 'none' as EncryptionAlgorithm,
  }
  const manifest = new MetadataGenerator().generateManifest(assets, runtimePackage.id, {
    format: 'qpk',
    compression,
    encryption,
    compatibility,
    version: runtimePackage.version,
  })
  manifest.runtimePackage = withRuntimePackageIntegrity(runtimePackage, createMerkleRoot(assets))
  manifest.merkleRoot = manifest.runtimePackage.integrity?.hash

  const qpk = new QPKBundler([], encryption.algorithm, options.encryption?.key)
  await qpk.createBundle(assets, manifest, output, {
    compress: compression.algorithm !== 'none',
    encrypt: encryption.enabled,
    compressionLevel: compression.level,
  })

  return { output, manifest, assets }
}

async function readBaseManifest(basePath: string): Promise<BundleManifest> {
  if (basePath.toLowerCase().endsWith('.qpk')) {
    return (await new QPKBundler().readBundle(basePath)).manifest
  }
  return JSON.parse(await readFile(basePath, 'utf8')) as BundleManifest
}

async function compileLocaleAssets(
  assets: AssetInfo[],
  baseCandidates: AssetInfo[],
  baseManifest: BundleManifest,
  locale: string,
  projectRoot: string,
  version = '1.0.0',
): Promise<CompiledLocaleAssets> {
  const compiled: AssetInfo[] = []
  const scripts: RuntimePackageScriptManifest[] = []

  for (const asset of assets) {
    if (asset.type !== 'scripts' || !asset.relativePath.toLowerCase().endsWith('.qs')) {
      compiled.push(asset)
      continue
    }

    const stableRelativePath = stripLocaleFromRelativePath(asset.relativePath, locale).replace(/\.qs$/i, '.js')
    const assetName = basename(stableRelativePath)
    const baseAsset = baseCandidates.find(candidate =>
      candidate.type === 'scripts'
      && candidate.relativePath.toLowerCase().endsWith('.qs')
      && (candidate.locales[0] || 'default') === 'default'
      && stripLocaleFromRelativePath(candidate.relativePath, 'default').replace(/\.qs$/i, '.js') === stableRelativePath,
    )
    if (!baseAsset) {
      throw new Error(`Localized QuaScript "${asset.relativePath}" requires --base-source with "${stableRelativePath.replace(/\.js$/i, '.qs')}".`)
    }

    const moduleId = resolveBaseScriptModuleId(baseManifest.runtimePackage, assetName, stableRelativePath)
    const localizedSource = await readFile(asset.path, 'utf8')
    const baseSource = await readFile(baseAsset.path, 'utf8')
    const compiledTs = compileLocalizedQuaScriptModuleToTs({
      baseSource,
      localizedSource,
      locale,
      projectRoot,
      runtimeModule: moduleId
        ? {
            moduleId,
            version,
            stableSeed: baseAsset.hash,
          }
        : undefined,
    })
    const output = ts.transpileModule(compiledTs, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText
    const content = Buffer.from(output, 'utf8')
    const relativePath = asset.relativePath.replace(/\.qs$/i, '.js')

    compiled.push({
      ...asset,
      name: basename(relativePath),
      relativePath,
      size: content.length,
      hash: createHash('sha256').update(content).digest('hex'),
      mimeType: 'text/javascript',
      content,
    })
    if (moduleId) {
      scripts.push({
        id: moduleId,
        version,
        assetName,
      })
    }
  }

  return { assets: compiled, scripts }
}

function createLocaleRuntimePackage(input: {
  baseManifest: BundleManifest
  locale: string
  options: LocalePackBuildOptions
  resourceTypes: AssetType[]
  scripts: RuntimePackageScriptManifest[]
}): RuntimePackageManifest {
  const runtimeTargetIds = input.options.targets
    .filter(target => target.kind === 'runtimePackage')
    .map(target => target.id)
  const id = input.options.packageId || defaultLocalePackPackageId(input.options.targets, input.locale)
  const version = input.options.version || input.baseManifest.runtimePackage?.version || input.baseManifest.version || '1.0.0'
  return {
    id,
    version,
    priority: input.options.priority ?? input.baseManifest.runtimePackage?.priority,
    compatibility: input.options.compatibility || input.baseManifest.runtimePackage?.compatibility || input.baseManifest.compatibility,
    dependencies: unique([
      ...(input.baseManifest.runtimePackage?.dependencies || []),
      ...runtimeTargetIds,
    ]),
    localePack: {
      locale: input.locale,
      targets: input.options.targets.map(target => ({ ...target })),
      resourceTypes: input.resourceTypes,
    },
    scripts: input.scripts.length > 0 ? input.scripts : undefined,
    signature: input.options.signature,
    metadata: {
      kind: 'locale-pack',
      ...(input.baseManifest.runtimePackage?.metadata || {}),
    },
  }
}

function defaultLocalePackPackageId(targets: RuntimeLocalePackTargetManifest[], locale: string): string {
  if (targets.length === 1) {
    return `${targets[0].id}.locale.${locale}`
  }
  const hash = createHash('sha1')
    .update(targets.map(target => `${target.kind}:${target.id}`).sort().join('|'))
    .digest('hex')
    .slice(0, 8)
  return `locale.${locale}.${hash}`
}

function baseManifestHasSameLocaleAsset(manifest: BundleManifest, asset: AssetInfo, locale: string): boolean {
  const key = stableAssetKey(asset, locale)
  const record = manifest.assets[asset.type]?.[key]
  if (!record) {
    return false
  }
  const variant = record.variants?.[locale]
  if (variant) {
    return variant.hash === asset.hash
  }
  return record.locales?.map(normalizeLocale).includes(locale) && record.hash === asset.hash
}

function stableAssetKey(asset: AssetInfo, locale: string): string {
  const relativePath = stripLocaleFromRelativePath(asset.relativePath, locale)
  const parts = relativePath.split('/')
  if (asset.type === 'characters') {
    return parts.slice(1).join('/')
  }
  if (parts[0]?.toLowerCase() === asset.type) {
    return parts.slice(1).join('/')
  }
  return basename(relativePath)
}

function resolveBaseScriptModuleId(
  runtimePackage: RuntimePackageManifest | undefined,
  assetName: string,
  stableRelativePath: string,
): string | undefined {
  return runtimePackage?.scripts?.find(script =>
    script.assetName === assetName
    || script.assetName === stableRelativePath
    || script.assetName === basename(stableRelativePath),
  )?.id
}

function stripLocaleFromRelativePath(relativePath: string, locale: string): string {
  if (!locale || locale === 'default') {
    return relativePath
  }

  const normalized = normalizeLocale(locale)
  const parts = relativePath.split('/')
  const withoutLocaleDirs = parts.filter(part => normalizeLocale(part) !== normalized)
  const fileName = withoutLocaleDirs.pop()
  if (!fileName) {
    return withoutLocaleDirs.join('/')
  }

  const extension = extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  const stemParts = stem.split('.').filter(part => normalizeLocale(part) !== normalized)
  withoutLocaleDirs.push(`${stemParts.join('.')}${extension}`)
  return withoutLocaleDirs.join('/')
}

function withRuntimePackageIntegrity(runtimePackage: RuntimePackageManifest, merkleRoot: string): RuntimePackageManifest {
  return {
    ...runtimePackage,
    integrity: {
      ...(runtimePackage.integrity || {}),
      algorithm: runtimePackage.integrity?.algorithm || 'sha256',
      hash: merkleRoot,
    },
  }
}

function createMerkleRoot(assets: AssetInfo[]): string {
  const hashes = [...assets].sort((a, b) => a.relativePath.localeCompare(b.relativePath)).map(asset => asset.hash)
  if (hashes.length === 0) {
    return createHash('sha256').update('').digest('hex')
  }
  return hashes.reduce((left, right) => createHash('sha256').update(left).update(right).digest('hex'))
}

function normalizeLocale(locale: string): string {
  return locale.toLowerCase().replace(/_/g, '-')
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function resolveLocalePackCompatibility(
  compatibility: VersionCompatibility | undefined,
  baseCompatibility: VersionCompatibility | undefined,
): VersionCompatibility {
  const resolved = {
    ...baseCompatibility,
    ...compatibility,
  }
  if (!resolved?.minGameVersion) {
    throw new Error('Locale pack runtime packages require compatibility.minGameVersion.')
  }
  if (!isValidSemverVersion(resolved.minGameVersion)) {
    throw new Error(`Invalid minGameVersion format: ${resolved.minGameVersion}`)
  }
  return { ...resolved }
}
