import type {
  AssetBundleTarget,
  AssetBundleTargetManifest,
  AssetInfo,
  AssetPipelineDomain,
  BuildLog,
  BundleDefinition,
  BundleFormat,
  BundleManifest,
  BundleOptions,
  BundleStats,
  CocosHybridAssetManifest,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  EncryptionPlugin,
  QuackConfig,
  QuackPlugin,
  RuntimePackageManifest,
  WorkspaceConfig,
} from './types'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { createLogger } from '@quajs/logger'
import { compileLocalizedQuaScriptModuleToTsAsync, compileQuaScriptModuleToTsAsync, extractQuaScriptStoryDeclaration } from '@quajs/script-compiler'
import { isValidSemverVersion } from '@quajs/utils'
import ts from 'typescript'
import { AssetDetector } from '../assets/asset-detector'
import { MetadataGenerator } from '../assets/metadata'
import { QPKBundler } from '../bundlers/qpk-bundler'
import { ZipBundler } from '../bundlers/zip-bundler'
import { EncryptionManager } from '../crypto/encryption'
import { PluginManager } from '../managers/plugin-manager'
import { readKeyFile, signRuntimePackageManifest } from '../security/signature'
import { VersionManager } from '../workspace/versioning'
import { WorkspaceManager } from '../workspace/workspace'

const logger = createLogger('quack:bundler')
const ASSET_PIPELINE_DOMAINS: AssetPipelineDomain[] = ['images', 'characters', 'audio', 'video', 'fonts']
const COCOS_MOBILE_BUILD_PLATFORMS = new Set([
  'android',
  'ios',
  'harmonyos',
  'wechat-minigame',
  'bytedance-minigame',
  'alipay-minigame',
  'taobao-minigame',
  'oppo-minigame',
  'vivo-minigame',
  'huawei-quick-game',
  'web-mobile',
])
const DEFAULT_COCOS_HYBRID_ASSET_BUNDLE = 'qua-hybrid'
const DEFAULT_COCOS_HYBRID_RESOURCE_ROOT = 'assets/qua-native'

export class QuackBundler extends EventEmitter {
  private config: QuackConfig
  private pluginManager: PluginManager
  private assetDetector: AssetDetector
  private metadataGenerator: MetadataGenerator
  private versionManager: VersionManager
  private workspaceManager?: WorkspaceManager
  private isWorkspaceMode: boolean

  constructor(config: QuackConfig) {
    super()
    this.config = config
    this.isWorkspaceMode = !!(config.workspace || config.workspaceConfig)

    this.pluginManager = new PluginManager()
    this.assetDetector = new AssetDetector(config.ignore || [])
    this.metadataGenerator = new MetadataGenerator()

    // Initialize version manager with workspace mode if applicable
    const outputDir = config.output ? dirname(resolve(config.output)) : process.cwd()
    this.versionManager = new VersionManager(outputDir, this.isWorkspaceMode)

    // Initialize workspace manager if in workspace mode
    if (this.isWorkspaceMode) {
      this.workspaceManager = new WorkspaceManager()
    }

    // Register plugins
    if (config.plugins && config.plugins.length > 0) {
      this.pluginManager.registerMany(config.plugins)
    }
  }

  /**
   * Create bundle from source directory
   */
  async bundle(): Promise<BundleStats> {
    const startTime = Date.now()

    try {
      const normalizedConfig = await this.normalizeConfig(this.config)

      if (normalizedConfig.assetTargets.length > 0) {
        return await this.bundleAssetTargets(normalizedConfig, {
          manifestName: 'bundle',
          startTime,
          allowEmpty: false,
        })
      }

      return await this.bundleNormalizedConfig(normalizedConfig, {
        manifestName: 'bundle',
        startTime,
        allowEmpty: false,
      })
    }
    catch (error) {
      logger.error('Bundle creation failed:', error)
      throw error
    }
    finally {
      // Cleanup plugins
      await this.pluginManager.cleanup()
    }
  }

  /**
   * Bundle all bundles in a workspace
   */
  async bundleWorkspace(): Promise<{ bundleStats: Record<string, BundleStats>, totalTime: number }> {
    if (!this.isWorkspaceMode || !this.workspaceManager) {
      throw new Error('Not in workspace mode')
    }

    const startTime = Date.now()
    const bundleStats: Record<string, BundleStats> = {}

    try {
      // Load workspace configuration
      const workspaceConfig = await this.workspaceManager.loadConfig(this.config.workspaceConfig, {
        projectConfig: this.config.projectConfig,
      })

      // Initialize or update workspace index
      await this.versionManager.initializeWorkspaceIndex(workspaceConfig.name, workspaceConfig.version || '1.0.0')

      // Get bundles in build order
      const buildOrder = this.workspaceManager.getBundlesBuildOrder()

      logger.info(`Building ${buildOrder.length} bundles in workspace "${workspaceConfig.name}"`)

      for (const bundleDefinition of buildOrder) {
        logger.info(`Building bundle: ${bundleDefinition.displayName || bundleDefinition.name}`)

        const stats = await this.bundleWorkspaceBundle(bundleDefinition, workspaceConfig)
        bundleStats[bundleDefinition.name] = stats

        logger.info(`Bundle "${bundleDefinition.name}" completed successfully`)
      }

      const totalTime = Date.now() - startTime
      logger.info(`Workspace build completed in ${totalTime}ms`)

      return { bundleStats, totalTime }
    }
    catch (error) {
      logger.error('Workspace bundle creation failed:', error)
      throw error
    }
  }

  /**
   * Bundle a specific bundle in workspace
   */
  async bundleWorkspaceBundle(bundleDefinition: BundleDefinition, _workspaceConfig: WorkspaceConfig): Promise<BundleStats> {
    if (!this.workspaceManager) {
      throw new Error('Workspace manager not initialized')
    }

    const startTime = Date.now()

    try {
      // Create bundle-specific configuration
      const bundleConfig = this.workspaceManager.createBundleConfig(bundleDefinition.name)

      // Normalize configuration
      const normalizedConfig = await this.normalizeConfig(bundleConfig)

      if (normalizedConfig.assetTargets.length > 0) {
        return await this.bundleAssetTargets(normalizedConfig, {
          manifestName: bundleDefinition.displayName || bundleDefinition.name,
          startTime,
          allowEmpty: true,
          workspaceBundle: bundleDefinition,
        })
      }

      return await this.bundleNormalizedConfig(normalizedConfig, {
        manifestName: bundleDefinition.displayName || bundleDefinition.name,
        startTime,
        allowEmpty: true,
        workspaceBundle: bundleDefinition,
      })
    }
    catch (error) {
      logger.error(`Bundle creation failed for "${bundleDefinition.name}":`, error)
      throw error
    }
    finally {
      // Cleanup plugins
      await this.pluginManager.cleanup()
    }
  }

  private async bundleAssetTargets(
    baseConfig: BundleOptions,
    options: {
      manifestName: string
      startTime: number
      allowEmpty: boolean
      workspaceBundle?: BundleDefinition
    },
  ): Promise<BundleStats> {
    const targetStats: Record<string, BundleStats> = {}
    let firstStats: BundleStats | undefined

    logger.info(`Building ${baseConfig.assetTargets.length} asset bundle targets`)

    for (const target of baseConfig.assetTargets) {
      const targetConfig = applyAssetTargetToConfig(baseConfig, target)
      try {
        const stats = await this.bundleNormalizedConfig(targetConfig, options)
        targetStats[target.name] = stats
        firstStats ??= stats
      }
      catch (error) {
        if (target.optional) {
          logger.warn(`Optional asset target "${target.name}" skipped: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        throw error
      }
    }

    if (!firstStats) {
      throw new Error('No asset bundle targets were built successfully')
    }

    return {
      ...firstStats,
      targets: targetStats,
    }
  }

  private async bundleNormalizedConfig(
    normalizedConfig: BundleOptions,
    options: {
      manifestName: string
      startTime: number
      allowEmpty: boolean
      workspaceBundle?: BundleDefinition
    },
  ): Promise<BundleStats> {
    logger.info(`Starting bundle creation from: ${normalizedConfig.source}`)
    logger.info(`Output: ${normalizedConfig.output} (${normalizedConfig.format})`)

    try {
      await this.pluginManager.initialize(normalizedConfig)

      let assets = await this.assetDetector.discoverAssets(normalizedConfig.source)
      assets = await this.pluginManager.collectAssets({
        source: normalizedConfig.source,
        assets,
      })
      assets = await this.compileQuaScriptAssets(assets, normalizedConfig)

      if (assets.length === 0) {
        if (!options.allowEmpty) {
          throw new Error('No assets found in source directory')
        }
        logger.warn(`No assets found in bundle "${options.manifestName}" source directory`)
        return {
          totalFiles: 0,
          totalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
          processingTime: Date.now() - options.startTime,
          locales: [],
          assetsByType: { images: 0, characters: 0, audio: 0, video: 0, fonts: 0, scripts: 0, data: 0 },
          bundleVersion: normalizedConfig.versioning.bundleVersion,
          buildNumber: normalizedConfig.versioning.buildNumber,
          assetTarget: normalizedConfig.assetTarget ? createAssetTargetManifest(normalizedConfig.assetTarget) : undefined,
        }
      }

      assets = this.versionManager.assignAssetVersions(assets, 1)
      assets = await this.processAssetsForBundle(assets)

      const locales = this.assetDetector.getLocalesFromAssets(assets)
      const { tree, root } = this.versionManager.createMerkleTree(assets)
      const manifest = this.metadataGenerator.generateManifest(assets, options.manifestName, {
        format: normalizedConfig.format,
        compression: normalizedConfig.compression,
        encryption: normalizedConfig.encryption,
        compatibility: normalizedConfig.compatibility,
        version: normalizedConfig.versioning.bundleVersion?.toString() || '1.0.0',
        buildNumber: normalizedConfig.versioning.buildNumber,
      })

      manifest.bundleVersion = normalizedConfig.versioning.bundleVersion
      manifest.buildNumber = normalizedConfig.versioning.buildNumber
      manifest.merkleRoot = root
      manifest.runtimePackage = withRuntimePackageIntegrity(normalizedConfig.runtimePackage, root)
      manifest.assetTarget = normalizedConfig.assetTarget ? createAssetTargetManifest(normalizedConfig.assetTarget) : undefined
      const { bundleAssets, nativeAssets } = await applyCocosHybridAssetSplit(assets, manifest, normalizedConfig.output)
      await this.applyManifestSignature(manifest, normalizedConfig)

      if (options.workspaceBundle) {
        ;(manifest as any).workspaceBundle = {
          name: options.workspaceBundle.name,
          displayName: options.workspaceBundle.displayName,
          priority: options.workspaceBundle.priority,
          dependencies: options.workspaceBundle.dependencies,
          loadTrigger: options.workspaceBundle.loadTrigger,
        }
      }

      if (!this.metadataGenerator.validateManifest(manifest)) {
        throw new Error('Generated manifest is invalid')
      }

      const tempBundlePath = `${normalizedConfig.output}.tmp`
      await mkdir(dirname(normalizedConfig.output), { recursive: true })

      if (normalizedConfig.format === 'zip') {
        const zipBundler = new ZipBundler()
        await zipBundler.createBundle(bundleAssets, manifest, tempBundlePath)
      }
      else {
        const qpkBundler = new QPKBundler(
          [],
          normalizedConfig.encryption.algorithm,
          normalizedConfig.encryption.key,
          normalizedConfig.encryption.plugin,
        )
        await qpkBundler.createBundle(bundleAssets, manifest, tempBundlePath, {
          compress: normalizedConfig.compression.algorithm !== 'none',
          encrypt: normalizedConfig.encryption.enabled,
          compressionLevel: normalizedConfig.compression.level,
        })
      }
      if (nativeAssets.length > 0) {
        logger.info(`Wrote ${nativeAssets.length} Cocos hybrid native assets outside the ${normalizedConfig.format.toUpperCase()} payload`)
      }

      const finalBundlePath = this.versionManager.generateBundleFilename(
        normalizedConfig.output,
        normalizedConfig.versioning.bundleVersion,
        normalizedConfig.versioning.buildNumber,
      )
      await rename(tempBundlePath, finalBundlePath)

      const buildLog: BuildLog = {
        buildNumber: normalizedConfig.versioning.buildNumber,
        bundleVersion: normalizedConfig.versioning.bundleVersion,
        timestamp: new Date().toISOString(),
        bundlePath: finalBundlePath,
        bundleHash: '',
        compatibility: manifest.compatibility,
        totalFiles: assets.length,
        totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
        assets: Object.fromEntries(
          assets.map(asset => [asset.relativePath, {
            hash: asset.hash,
            path: asset.path,
            size: asset.size,
            version: asset.version || 1,
            mtime: asset.mtime || Date.now(),
          }]),
        ),
        merkleTree: tree,
        merkleRoot: root,
        buildStats: {
          processingTime: Date.now() - options.startTime,
          compressionRatio: 0,
          locales: locales.map(l => l.code),
        },
      }

      await this.versionManager.saveBuildLog(buildLog, finalBundlePath, manifest)
      if (options.workspaceBundle) {
        await this.versionManager.updateBundleInWorkspace(
          options.workspaceBundle.name,
          buildLog,
          finalBundlePath,
          manifest,
          options.workspaceBundle,
        )
      }
      await this.pluginManager.postBundle(finalBundlePath, manifest)

      const endTime = Date.now()
      const stats = this.calculateStats(manifest, endTime - options.startTime)
      logger.info(`Bundle created successfully in ${endTime - options.startTime}ms`)
      logger.info(`Final bundle: ${finalBundlePath}`)
      if (!options.workspaceBundle) {
        this.logStats(stats)
      }

      return stats
    }
    finally {
      await this.pluginManager.cleanup()
    }
  }

  /**
   * Normalize and validate configuration
   */
  private async normalizeConfig(config: QuackConfig): Promise<BundleOptions> {
    if (!config.source) {
      throw new Error('Source directory is required')
    }

    const source = resolve(config.source)

    // Determine output path
    let output = config.output
    if (!output) {
      const baseName = dirname(source).split(/[/\\]/).pop() || 'bundle'
      output = resolve(source, '..', `${baseName}.zip`)
    }
    else {
      output = resolve(output)
    }

    // Determine format
    let format: BundleFormat
    if (config.format === 'auto') {
      format = process.env.NODE_ENV === 'production' ? 'qpk' : 'zip'
    }
    else {
      format = config.format || 'zip'
    }

    // Update output extension based on format
    if (format === 'qpk' && !output.endsWith('.qpk')) {
      output = output.replace(/\.[^.]+$/, '.qpk')
    }
    else if (format === 'zip' && !output.endsWith('.zip')) {
      output = output.replace(/\.[^.]+$/, '.zip')
    }

    // Get versioning info
    const versionManager = new VersionManager(dirname(output))
    const versionInfo = await versionManager.getVersionInfo(config.versioning || {})
    let compatibility = resolveCompatibility(config.compatibility, config.runtimePackage)

    // Normalize compression
    const compressionAlgorithm = config.compression?.algorithm ?? (format === 'qpk' ? 'lzma' : 'deflate') as CompressionAlgorithm
    if (format === 'qpk' && compressionAlgorithm === 'deflate') {
      throw new Error('QPK compression only supports none or lzma')
    }

    const compression = {
      level: config.compression?.level ?? (format === 'qpk' ? 6 : 6),
      algorithm: compressionAlgorithm,
    }

    // Normalize encryption
    const encryptionEnabled = config.encryption?.enabled ?? false
    const encryptionAlgorithm = encryptionEnabled
      ? (config.encryption?.algorithm ?? 'xor' as EncryptionAlgorithm)
      : 'none'
    const encryptionKey = this.resolveEncryptionKey(config.encryption?.key, config.encryption?.keyGenerator)
    const encryption = {
      enabled: encryptionEnabled,
      algorithm: encryptionAlgorithm,
      key: encryptionKey,
      plugin: config.encryption?.plugin,
    }

    const assetTarget = config.assetTarget
    if (assetTarget) {
      output = addOutputSuffix(output, assetTarget.suffix || assetTarget.name)
      if (assetTarget.compatibility) {
        compatibility = {
          ...compatibility,
          ...assetTarget.compatibility,
        }
      }
      applyCocosStaticQpkCompressionDefaults(format, compression, assetTarget)
      if (assetTarget.compression) {
        compression.level = assetTarget.compression.level ?? compression.level
        compression.algorithm = assetTarget.compression.algorithm ?? compression.algorithm
      }
      if (format === 'qpk' && compression.algorithm === 'deflate') {
        throw new Error(`QPK compression only supports none or lzma for asset target "${assetTarget.name}"`)
      }
      applyCocosStaticQpkEncryptionDefaults(format, encryption, assetTarget)
      if (assetTarget.encryption) {
        encryption.enabled = assetTarget.encryption.enabled ?? encryption.enabled
        encryption.algorithm = encryption.enabled
          ? (assetTarget.encryption.algorithm ?? encryption.algorithm)
          : 'none'
        encryption.key = assetTarget.encryption.key ?? encryption.key
      }
    }

    const runtimePackage = config.runtimePackage
      ? {
          ...cloneRuntimePackage(config.runtimePackage),
          compatibility,
        }
      : undefined

    return {
      source,
      output,
      format,
      compression,
      encryption,
      versioning: {
        ...config.versioning,
        ...versionInfo,
      },
      compatibility,
      plugins: config.plugins || [],
      ignore: config.ignore || [],
      verbose: config.verbose || false,
      runtimePackage,
      signing: config.signing,
      quascript: {
        projectRoot: resolve(config.quascript?.projectRoot || source),
        autoCollectDecorators: config.quascript?.autoCollectDecorators,
        decoratorMappings: config.quascript?.decoratorMappings,
      },
      assetTargets: config.assetTargets || [],
      assetTarget,
    }
  }

  private async applyManifestSignature(manifest: BundleManifest, config: BundleOptions): Promise<void> {
    if (!config.signing?.key) {
      return
    }
    if (config.format !== 'qpk') {
      throw new Error('Runtime package signing requires QPK output format.')
    }
    if (!manifest.runtimePackage) {
      throw new Error('Runtime package signing requires runtimePackage metadata.')
    }

    const privateKey = await readKeyFile(config.signing.key)
    manifest.runtimePackage = await signRuntimePackageManifest(manifest, {
      keyId: config.signing.keyId || manifest.runtimePackage.signature?.keyId,
      privateKey,
    })
  }

  /**
   * Resolve encryption key
   */
  private resolveEncryptionKey(
    key?: string | (() => string),
    keyGenerator?: () => string,
  ): string | undefined {
    if (typeof key === 'function') {
      return key()
    }
    if (typeof key === 'string') {
      return key
    }
    if (keyGenerator) {
      return keyGenerator()
    }

    // Check environment variable
    const envKey = process.env[EncryptionManager.getEncryptionKeyEnvVar()]
    if (envKey) {
      return envKey
    }

    return undefined // No default key - will skip encryption if not provided
  }

  /**
   * Run asset processors before manifest generation so size/hash metadata
   * describes the actual bytes written to the bundle.
   */
  private async compileQuaScriptAssets(assets: AssetInfo[], config: BundleOptions): Promise<AssetInfo[]> {
    const compiled: AssetInfo[] = []
    const scriptVariants = new Map<string, { locales: Set<string>, stableRelativePath: string }>()

    for (const asset of assets) {
      if (asset.type !== 'scripts' || !asset.relativePath.toLowerCase().endsWith('.qs')) {
        compiled.push(asset)
        continue
      }

      const locale = asset.locales[0] || 'default'
      const stableRelativePath = stripLocaleFromRelativePath(asset.relativePath, locale).replace(/\.qs$/i, '.js')
      const assetName = basename(stableRelativePath)
      const baseAsset = locale === 'default'
        ? asset
        : assets.find(candidate =>
            candidate.type === 'scripts'
            && candidate.relativePath.toLowerCase().endsWith('.qs')
            && (candidate.locales[0] || 'default') === 'default'
            && stripLocaleFromRelativePath(candidate.relativePath, 'default').replace(/\.qs$/i, '.js') === stableRelativePath,
          )
      if (!baseAsset) {
        throw new Error(`Localized QuaScript "${asset.relativePath}" requires a default base "${stableRelativePath.replace(/\.js$/i, '.qs')}".`)
      }
      const moduleId = resolveQuaScriptModuleId(config.runtimePackage, assetName, stableRelativePath)
      const source = await readFile(asset.path, 'utf8')
      const runtimeModule = moduleId
        ? {
            moduleId,
            version: config.runtimePackage?.version,
            stableSeed: baseAsset.hash,
          }
        : undefined
      const compiledTs = locale === 'default'
        ? await compileQuaScriptModuleToTsAsync(source, {
            hotReload: false,
            projectRoot: config.quascript.projectRoot,
            autoCollectDecorators: config.quascript.autoCollectDecorators,
            decoratorMappings: config.quascript.decoratorMappings,
            runtimeModule,
          })
        : await compileLocalizedQuaScriptModuleToTsAsync({
            baseSource: await readFile(baseAsset.path, 'utf8'),
            localizedSource: source,
            locale,
            projectRoot: config.quascript.projectRoot,
            autoCollectDecorators: config.quascript.autoCollectDecorators,
            decoratorMappings: config.quascript.decoratorMappings,
            runtimeModule,
          })
      if (locale === 'default' && config.runtimePackage && moduleId) {
        mergeQuaScriptStoryDeclaration(config.runtimePackage, moduleId, source)
      }
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
        hash: calculateHash(content),
        mimeType: 'text/javascript',
        content,
      })

      const variant = scriptVariants.get(assetName) || { locales: new Set<string>(), stableRelativePath }
      variant.locales.add(locale)
      scriptVariants.set(assetName, variant)
    }

    if (config.runtimePackage && scriptVariants.size > 0) {
      config.runtimePackage.scripts = mergeRuntimeQuaScriptVariants(config.runtimePackage, scriptVariants)
    }

    return compiled
  }

  /**
   * Run asset processors before manifest generation so size/hash metadata
   * describes the actual bytes written to the bundle.
   */
  private async processAssetsForBundle(assets: AssetInfo[]): Promise<AssetInfo[]> {
    if (this.pluginManager.getPlugins().length === 0) {
      return assets
    }

    const processedAssets: AssetInfo[] = []

    for (const asset of assets) {
      const buffer = await readAssetBuffer(asset)
      const context = {
        asset: { ...asset },
        buffer,
        metadata: {},
      }

      await this.pluginManager.processAsset(context)

      processedAssets.push({
        ...context.asset,
        content: context.buffer,
        size: context.buffer.length,
        hash: calculateHash(context.buffer),
      })
    }

    return processedAssets
  }

  /**
   * Calculate bundle statistics
   */
  private calculateStats(manifest: BundleManifest, processingTime: number): BundleStats {
    return {
      totalFiles: manifest.totalFiles,
      totalSize: manifest.totalSize,
      compressedSize: 0, // Would be calculated from actual bundle size
      compressionRatio: 0,
      processingTime,
      locales: manifest.locales.map((code: string) => ({
        code,
        name: this.getLocaleName(code),
        isDefault: code === manifest.defaultLocale,
      })),
      assetsByType: {
        images: Object.keys(manifest.assets.images || {}).length,
        characters: Object.keys(manifest.assets.characters || {}).length,
        audio: Object.keys(manifest.assets.audio || {}).length,
        video: Object.keys(manifest.assets.video || {}).length,
        fonts: Object.keys(manifest.assets.fonts || {}).length,
        scripts: Object.keys(manifest.assets.scripts || {}).length,
        data: Object.keys(manifest.assets.data || {}).length,
      },
      bundleVersion: manifest.bundleVersion,
      buildNumber: manifest.buildNumber || 'unknown',
    }
  }

  /**
   * Log bundle statistics
   */
  private logStats(stats: BundleStats): void {
    logger.info('=== Bundle Statistics ===')
    logger.info(`Files: ${stats.totalFiles}`)
    logger.info(`Total size: ${this.formatBytes(stats.totalSize)}`)
    logger.info(`Processing time: ${stats.processingTime}ms`)
    logger.info(`Locales: ${stats.locales.map(l => l.code).join(', ')}`)
    logger.info('Assets by type:')
    for (const [type, count] of Object.entries(stats.assetsByType)) {
      if (count > 0) {
        logger.info(`  ${type}: ${count}`)
      }
    }
  }

  /**
   * Get human-readable name for locale
   */
  private getLocaleName(code: string): string {
    const names: Record<string, string> = {
      'default': 'Default',
      'en': 'English',
      'en-us': 'English (US)',
      'zh': 'Chinese',
      'zh-cn': 'Chinese (Simplified)',
      'ja': 'Japanese',
      'ja-jp': 'Japanese (Japan)',
    }

    return names[code.toLowerCase()] || code.toUpperCase()
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0)
      return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  /**
   * Get configuration
   */
  getConfig(): QuackConfig {
    return { ...this.config }
  }

  /**
   * Add plugin
   */
  addPlugin(plugin: QuackPlugin): void {
    this.pluginManager.register(plugin)
    if (!this.config.plugins) {
      this.config.plugins = []
    }
    this.config.plugins.push(plugin)
  }

  /**
   * Remove plugin
   */
  removePlugin(name: string): boolean {
    const removed = this.pluginManager.remove(name)
    if (removed && this.config.plugins) {
      this.config.plugins = this.config.plugins.filter(p => p.name !== name)
    }
    return removed
  }
}

/**
 * Configuration helper function
 */
export function defineConfig(config: QuackConfig): QuackConfig {
  return config
}

function resolveCompatibility(
  compatibility: QuackConfig['compatibility'],
  runtimePackage: RuntimePackageManifest | undefined,
): QuackConfig['compatibility'] {
  const runtimeCompatibility = runtimePackage?.compatibility
  const merged = {
    ...runtimeCompatibility,
    ...compatibility,
  }
  const hasCompatibility = compatibility !== undefined || runtimeCompatibility !== undefined

  if (runtimePackage) {
    if (
      compatibility?.minGameVersion
      && runtimeCompatibility?.minGameVersion
      && compatibility.minGameVersion !== runtimeCompatibility.minGameVersion
    ) {
      throw new Error(`Runtime package "${runtimePackage.id}" compatibility conflicts with top-level compatibility.`)
    }
    if (!merged?.minGameVersion) {
      throw new Error(`Runtime package "${runtimePackage.id}" requires compatibility.minGameVersion.`)
    }
    validateCompatibilityMinVersion(merged.minGameVersion, `Runtime package "${runtimePackage.id}"`)
  }
  else if (merged?.minGameVersion) {
    validateCompatibilityMinVersion(merged.minGameVersion, 'Bundle')
  }

  return hasCompatibility ? { ...merged } : undefined
}

function validateCompatibilityMinVersion(version: string, subject: string): void {
  if (!isValidSemverVersion(version)) {
    throw new Error(`${subject} has invalid minGameVersion "${version}".`)
  }
}

function withRuntimePackageIntegrity(
  runtimePackage: RuntimePackageManifest | undefined,
  merkleRoot: string,
): RuntimePackageManifest | undefined {
  if (!runtimePackage) {
    return undefined
  }

  return {
    ...runtimePackage,
    integrity: {
      ...(runtimePackage.integrity || {}),
      algorithm: runtimePackage.integrity?.algorithm || 'sha256',
      hash: merkleRoot,
    },
  }
}

function applyAssetTargetToConfig(config: BundleOptions, target: AssetBundleTarget): BundleOptions {
  const compression = {
    ...config.compression,
    ...target.compression,
  }
  applyCocosStaticQpkCompressionDefaults(config.format, compression, target)
  const encryptionEnabled = target.encryption?.enabled ?? config.encryption.enabled
  const encryption = {
    ...config.encryption,
    ...target.encryption,
    enabled: encryptionEnabled,
    algorithm: encryptionEnabled
      ? (target.encryption?.algorithm ?? config.encryption.algorithm)
      : 'none' as EncryptionAlgorithm,
  }
  applyCocosStaticQpkEncryptionDefaults(config.format, encryption, target)
  const compatibility = {
    ...config.compatibility,
    ...target.compatibility,
  }
  const runtimePackage = config.runtimePackage
    ? {
        ...cloneRuntimePackage(config.runtimePackage),
        compatibility,
      }
    : undefined

  return {
    ...config,
    output: addOutputSuffix(config.output, target.suffix || target.name),
    compression,
    encryption,
    compatibility,
    runtimePackage,
    assetTargets: [],
    assetTarget: target,
  }
}

function isCocosAssetTarget(target: AssetBundleTarget): boolean {
  return target.platform === 'cocos' || Boolean(target.cocos)
}

function applyCocosStaticQpkCompressionDefaults(
  format: BundleFormat,
  compression: { level?: number, algorithm?: CompressionAlgorithm },
  target: AssetBundleTarget,
): void {
  if (isCocosAssetTarget(target) && format === 'qpk' && !target.compression) {
    compression.algorithm = 'none'
    compression.level = 0
  }
}

function applyCocosStaticQpkEncryptionDefaults(
  format: BundleFormat,
  encryption: { enabled: boolean, algorithm: EncryptionAlgorithm, key?: string, plugin?: EncryptionPlugin },
  target: AssetBundleTarget,
): void {
  if (isCocosAssetTarget(target) && format === 'qpk' && !target.encryption) {
    encryption.enabled = false
    encryption.algorithm = 'none'
    encryption.key = undefined
    encryption.plugin = undefined
  }
}

function cloneRuntimePackage(runtimePackage: RuntimePackageManifest): RuntimePackageManifest {
  return JSON.parse(JSON.stringify(runtimePackage)) as RuntimePackageManifest
}

function createAssetTargetManifest(target: AssetBundleTarget): AssetBundleTargetManifest {
  const staticOnly = target.staticOnly ?? target.cocos?.staticOnly ?? target.platform === 'cocos'
  return {
    name: target.name,
    platform: target.platform,
    displayName: target.displayName,
    suffix: target.suffix,
    description: target.description,
    browserCondition: target.browserCondition,
    formats: {
      images: target.pipeline?.images ? target.pipeline.images.format ?? 'webp' : undefined,
      characters: target.pipeline?.characters ? target.pipeline.characters.format ?? 'webp' : undefined,
      audio: target.pipeline?.audio ? target.pipeline.audio.format ?? 'aac' : undefined,
      video: target.pipeline?.video ? target.pipeline.video.format ?? 'webm' : undefined,
      fonts: target.pipeline?.fonts?.format,
    },
    staticOnly,
    cocos: isCocosAssetTarget(target) ? createCocosAssetTargetManifest(target, staticOnly) : undefined,
  }
}

function createCocosAssetTargetManifest(
  target: AssetBundleTarget,
  staticOnly: boolean,
): NonNullable<AssetBundleTargetManifest['cocos']> {
  return {
    ...target.cocos,
    staticOnly,
    materialization: {
      images: 'spriteFrame',
      characters: 'spriteFrame',
      audio: 'audioClip',
      video: 'videoClip',
      fonts: 'font',
      ...(target.cocos?.materialization || {}),
    },
    hybrid: resolveCocosHybridAssetManifest(target),
  }
}

function resolveCocosHybridAssetManifest(target: AssetBundleTarget): CocosHybridAssetManifest {
  const config = target.cocos?.hybrid
  const mobile = isCocosMobileAssetTarget(target)
  const domainOverrides = config?.domains || {}
  const hasNativeDomainOverride = Object.values(domainOverrides).includes('cocos-bundle')
  const enabled = config?.enabled ?? (mobile || hasNativeDomainOverride)
  const domains = Object.fromEntries(ASSET_PIPELINE_DOMAINS.map(domain => [domain, 'qpk'])) as CocosHybridAssetManifest['domains']

  if (enabled && (mobile || config?.enabled === true)) {
    domains.images = 'cocos-bundle'
    domains.characters = 'cocos-bundle'
  }
  if (enabled) {
    for (const [domain, placement] of Object.entries(domainOverrides) as [AssetPipelineDomain, CocosHybridAssetManifest['domains'][AssetPipelineDomain]][]) {
      domains[domain] = placement
    }
  }

  return {
    enabled,
    resourceRoot: config?.resourceRoot || target.cocos?.resourceRoot || DEFAULT_COCOS_HYBRID_RESOURCE_ROOT,
    assetBundle: config?.assetBundle || DEFAULT_COCOS_HYBRID_ASSET_BUNDLE,
    domains,
  }
}

function isCocosMobileAssetTarget(target: AssetBundleTarget): boolean {
  if (target.cocos?.mobile !== undefined)
    return target.cocos.mobile
  return (target.cocos?.buildPlatforms || []).some(platform => COCOS_MOBILE_BUILD_PLATFORMS.has(normalizeCocosBuildPlatform(platform)))
}

function normalizeCocosBuildPlatform(platform: string): string {
  return platform.trim().toLowerCase().replace(/_/g, '-')
}

async function applyCocosHybridAssetSplit(
  assets: AssetInfo[],
  manifest: BundleManifest,
  output: string,
): Promise<{ bundleAssets: AssetInfo[], nativeAssets: AssetInfo[] }> {
  const hybrid = manifest.assetTarget?.cocos?.hybrid
  if (!hybrid?.enabled) {
    return { bundleAssets: assets, nativeAssets: [] }
  }

  const nativeAssets = assets.filter(asset => isCocosHybridNativeAsset(asset, hybrid))
  if (nativeAssets.length === 0) {
    return { bundleAssets: assets, nativeAssets }
  }

  const nativeSources = new Map<string, string>()
  for (const asset of nativeAssets) {
    const source = createCocosHybridNativeSource(asset, hybrid)
    nativeSources.set(asset.path, source)
    nativeSources.set(asset.relativePath, source)
    await writeCocosHybridNativeAsset(asset, output, source)
  }
  rewriteCocosHybridManifestAssetPaths(manifest, hybrid, nativeSources)

  const nativeAssetKeys = new Set(nativeAssets.map(asset => `${asset.type}:${asset.relativePath}`))
  return {
    bundleAssets: assets.filter(asset => !nativeAssetKeys.has(`${asset.type}:${asset.relativePath}`)),
    nativeAssets,
  }
}

function isCocosHybridNativeAsset(asset: AssetInfo, hybrid: CocosHybridAssetManifest): boolean {
  return ASSET_PIPELINE_DOMAINS.includes(asset.type as AssetPipelineDomain)
    && hybrid.domains[asset.type as AssetPipelineDomain] === 'cocos-bundle'
}

async function writeCocosHybridNativeAsset(asset: AssetInfo, output: string, nativeSource: string): Promise<void> {
  const outputRoot = dirname(output)
  const outputPath = resolve(outputRoot, nativeSource)
  if (!isPathInside(outputPath, outputRoot)) {
    throw new Error(`Cocos hybrid asset path escapes output directory: ${nativeSource}`)
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, await readAssetBuffer(asset))
}

function rewriteCocosHybridManifestAssetPaths(
  manifest: BundleManifest,
  hybrid: CocosHybridAssetManifest,
  nativeSources: Map<string, string>,
): void {
  for (const domain of ASSET_PIPELINE_DOMAINS) {
    if (hybrid.domains[domain] !== 'cocos-bundle')
      continue
    const records = manifest.assets[domain]
    if (!records)
      continue
    for (const asset of Object.values(records)) {
      const nativeSource = nativeSources.get(asset.path) || nativeSources.get(asset.relativePath)
      if (nativeSource) {
        asset.path = nativeSource
        asset.relativePath = nativeSource
      }
      for (const variant of Object.values(asset.variants || {})) {
        const variantSource = nativeSources.get(variant.path) || nativeSources.get(variant.relativePath)
        if (variantSource) {
          variant.path = variantSource
          variant.relativePath = variantSource
        }
      }
    }
  }
}

function createCocosHybridNativeSource(asset: AssetInfo, hybrid: CocosHybridAssetManifest): string {
  const relativePath = stripAssetTypePrefix(asset.relativePath, asset.type)
  return normalizeRelativeOutputPath(`${hybrid.resourceRoot}/${hybrid.assetBundle}/${asset.type}/${relativePath}`)
}

function stripAssetTypePrefix(relativePath: string, type: string): string {
  return relativePath.replace(/\\/g, '/').replace(new RegExp(`^${escapeRegExp(type)}/`, 'i'), '')
}

function normalizeRelativeOutputPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(part => part && part !== '.')
  if (parts.includes('..')) {
    throw new Error(`Unsafe Cocos hybrid asset path: ${path}`)
  }
  return parts.join('/')
}

function isPathInside(path: string, root: string): boolean {
  const normalizedRoot = resolve(root)
  const normalizedPath = resolve(path)
  const relativePath = relative(normalizedRoot, normalizedPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function addOutputSuffix(output: string, suffix: string): string {
  const directory = dirname(output)
  const extension = output.endsWith('.qpk') ? '.qpk' : output.endsWith('.zip') ? '.zip' : ''
  if (!extension) {
    return `${output}.${suffix}`
  }
  return resolve(directory, `${basename(output, extension)}.${suffix}${extension}`)
}

function mergeRuntimeQuaScriptVariants(
  runtimePackage: RuntimePackageManifest,
  groups: Map<string, { locales: Set<string>, stableRelativePath: string }>,
): NonNullable<RuntimePackageManifest['scripts']> {
  const scripts = [...(runtimePackage.scripts || [])]

  for (const [assetName, group] of groups) {
    let script = scripts.find(candidate =>
      candidate.assetName === assetName
      || candidate.assetName === group.stableRelativePath
      || candidate.assetName === basename(group.stableRelativePath),
    )
    if (!script) {
      script = {
        id: `${runtimePackage.id}.${assetName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '.')}`,
        version: runtimePackage.version,
        assetName,
      }
      scripts.push(script)
    }

    const variants = { ...(script.variants || {}) }
    for (const locale of group.locales) {
      if (locale === 'default') {
        script.assetName = assetName
        continue
      }
      variants[locale] = {
        ...(variants[locale] || {}),
        assetName,
        version: script.version,
      }
    }
    if (Object.keys(variants).length > 0) {
      script.variants = variants
    }
  }

  return scripts
}

function mergeQuaScriptStoryDeclaration(
  runtimePackage: RuntimePackageManifest,
  moduleId: string,
  source: string,
): void {
  const declaration = extractQuaScriptStoryDeclaration(source, {
    moduleId,
    runtimePackageId: runtimePackage.id,
  })
  const hasStory = declaration.nodes.length > 0
    || declaration.labels.length > 0
    || declaration.choices.length > 0
    || declaration.edges.length > 0
  if (!hasStory) {
    return
  }

  const scripts = runtimePackage.scripts || []
  runtimePackage.scripts = scripts.map(script => script.id === moduleId
    ? {
        ...script,
        metadata: {
          ...(script.metadata || {}),
          story: declaration,
        },
      }
    : script)
  runtimePackage.storyGraphDeltas = [
    ...(runtimePackage.storyGraphDeltas || []),
    {
      id: `story:${moduleId}`,
      graphId: 'default',
      nodes: declaration.nodes,
      edges: declaration.edges,
      metadata: {
        moduleId,
        contentPackageId: runtimePackage.id,
      },
    },
  ]
}

function resolveQuaScriptModuleId(
  runtimePackage: RuntimePackageManifest | undefined,
  assetName: string,
  stableRelativePath: string,
): string | undefined {
  if (!runtimePackage) {
    return undefined
  }
  const existing = runtimePackage.scripts?.find(script =>
    script.assetName === assetName
    || script.assetName === stableRelativePath
    || script.assetName === basename(stableRelativePath),
  )
  if (existing) {
    return existing.id
  }
  return `${runtimePackage.id}.${assetName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '.')}`
}

function stripLocaleFromRelativePath(relativePath: string, locale: string): string {
  if (!locale || locale === 'default') {
    return relativePath
  }

  const normalized = locale.toLowerCase()
  const parts = relativePath.split('/')
  const withoutLocaleDirs = parts.filter(part => part.toLowerCase() !== normalized)
  const fileName = withoutLocaleDirs.pop()
  if (!fileName) {
    return withoutLocaleDirs.join('/')
  }

  const localePattern = new RegExp(`\\.${escapeRegExp(normalized)}(?=\\.[^.]+$)`, 'i')
  withoutLocaleDirs.push(fileName.replace(localePattern, ''))
  return withoutLocaleDirs.join('/')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readAssetBuffer(asset: AssetInfo): Promise<Buffer> {
  if (asset.content) {
    return Buffer.isBuffer(asset.content) ? asset.content : Buffer.from(asset.content)
  }

  return await readFile(asset.path)
}

function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
