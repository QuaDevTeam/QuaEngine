import type {
  AssetInfo,
  BuildLog,
  BundleDefinition,
  BundleFormat,
  BundleManifest,
  BundleOptions,
  BundleStats,
  CompressionAlgorithm,
  EncryptionAlgorithm,
  QuackConfig,
  QuackPlugin,
  RuntimePackageManifest,
  WorkspaceConfig,
} from './types'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { createLogger } from '@quajs/logger'
import { compileLocalizedQuaScriptModuleToTs, compileQuaScriptModuleToTs, extractQuaScriptStoryDeclaration } from '@quajs/script-compiler'
import ts from 'typescript'
import { AssetDetector } from '../assets/asset-detector'
import { MetadataGenerator } from '../assets/metadata'
import { QPKBundler } from '../bundlers/qpk-bundler'
import { ZipBundler } from '../bundlers/zip-bundler'
import { EncryptionManager } from '../crypto/encryption'
import { PluginManager } from '../managers/plugin-manager'
import { VersionManager } from '../workspace/versioning'
import { WorkspaceManager } from '../workspace/workspace'

const logger = createLogger('quack:bundler')

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
      // Normalize configuration first
      const normalizedConfig = await this.normalizeConfig(this.config)

      logger.info(`Starting bundle creation from: ${normalizedConfig.source}`)
      logger.info(`Output: ${normalizedConfig.output} (${normalizedConfig.format})`)

      // Initialize plugins
      await this.pluginManager.initialize(normalizedConfig)

      // Discover assets
      let assets = await this.assetDetector.discoverAssets(normalizedConfig.source)
      assets = await this.pluginManager.collectAssets({
        source: normalizedConfig.source,
        assets,
      })
      assets = await this.compileQuaScriptAssets(assets, normalizedConfig)

      if (assets.length === 0) {
        throw new Error('No assets found in source directory')
      }

      // Assign version numbers to assets
      assets = this.versionManager.assignAssetVersions(assets, 1)
      assets = await this.processAssetsForBundle(assets)

      // Get locales
      const locales = this.assetDetector.getLocalesFromAssets(assets)

      // Create Merkle tree
      const { tree, root } = this.versionManager.createMerkleTree(assets)

      // Generate manifest with versioning info
      const manifest = this.metadataGenerator.generateManifest(assets, 'bundle', {
        format: normalizedConfig.format,
        compression: normalizedConfig.compression,
        encryption: normalizedConfig.encryption,
        version: normalizedConfig.versioning.bundleVersion?.toString() || '1.0.0',
        buildNumber: normalizedConfig.versioning.buildNumber,
      })

      // Add versioning info to manifest
      manifest.bundleVersion = normalizedConfig.versioning.bundleVersion
      manifest.buildNumber = normalizedConfig.versioning.buildNumber
      manifest.merkleRoot = root
      manifest.runtimePackage = withRuntimePackageIntegrity(normalizedConfig.runtimePackage, root)

      // Validate manifest
      if (!this.metadataGenerator.validateManifest(manifest)) {
        throw new Error('Generated manifest is invalid')
      }

      // Generate temporary bundle path
      const tempBundlePath = `${normalizedConfig.output}.tmp`

      // Ensure output directory exists
      await mkdir(dirname(normalizedConfig.output), { recursive: true })

      // Create bundle based on format
      if (normalizedConfig.format === 'zip') {
        const zipBundler = new ZipBundler()
        await zipBundler.createBundle(assets, manifest, tempBundlePath)
      }
      else {
        const qpkBundler = new QPKBundler(
          [],
          normalizedConfig.encryption.algorithm,
          normalizedConfig.encryption.key,
          normalizedConfig.encryption.plugin,
        )
        await qpkBundler.createBundle(assets, manifest, tempBundlePath, {
          compress: normalizedConfig.compression.algorithm !== 'none',
          encrypt: normalizedConfig.encryption.enabled,
          compressionLevel: normalizedConfig.compression.level,
        })
      }

      // Generate final bundle filename with hash
      const finalBundlePath = this.versionManager.generateBundleFilename(
        normalizedConfig.output,
        normalizedConfig.versioning.bundleVersion,
        normalizedConfig.versioning.buildNumber,
      )

      // Rename temporary bundle to final name
      await rename(tempBundlePath, finalBundlePath)

      // Create build log
      const buildLog: BuildLog = {
        buildNumber: normalizedConfig.versioning.buildNumber,
        bundleVersion: normalizedConfig.versioning.bundleVersion,
        timestamp: new Date().toISOString(),
        bundlePath: finalBundlePath,
        bundleHash: '', // Will be calculated by versionManager
        totalFiles: assets.length,
        totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
        assets: Object.fromEntries(
          assets.map(asset => [asset.relativePath, {
            hash: asset.hash,
            size: asset.size,
            version: asset.version || 1,
            mtime: asset.mtime || Date.now(),
          }]),
        ),
        merkleTree: tree,
        merkleRoot: root,
        buildStats: {
          processingTime: Date.now() - startTime,
          compressionRatio: 0, // Will be calculated later
          locales: locales.map(l => l.code),
        },
      }

      // Save build log and update index
      await this.versionManager.saveBuildLog(buildLog, finalBundlePath, manifest)

      // Call post-bundle hooks
      await this.pluginManager.postBundle(finalBundlePath, manifest)

      // Calculate stats
      const endTime = Date.now()
      const stats = this.calculateStats(manifest, endTime - startTime)

      logger.info(`Bundle created successfully in ${endTime - startTime}ms`)
      logger.info(`Final bundle: ${finalBundlePath}`)
      this.logStats(stats)

      return stats
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
      const workspaceConfig = await this.workspaceManager.loadConfig(this.config.workspaceConfig)

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

      logger.info(`Building bundle "${bundleDefinition.name}" from: ${normalizedConfig.source}`)
      logger.info(`Output: ${normalizedConfig.output} (${normalizedConfig.format})`)

      // Initialize plugins
      await this.pluginManager.initialize(normalizedConfig)

      // Discover assets
      let assets = await this.assetDetector.discoverAssets(normalizedConfig.source)
      assets = await this.pluginManager.collectAssets({
        source: normalizedConfig.source,
        assets,
      })
      assets = await this.compileQuaScriptAssets(assets, normalizedConfig)

      if (assets.length === 0) {
        logger.warn(`No assets found in bundle "${bundleDefinition.name}" source directory`)
        // Create empty bundle stats
        return {
          totalFiles: 0,
          totalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
          processingTime: Date.now() - startTime,
          locales: [],
          assetsByType: { images: 0, characters: 0, audio: 0, video: 0, fonts: 0, scripts: 0, data: 0 },
          bundleVersion: normalizedConfig.versioning.bundleVersion,
          buildNumber: normalizedConfig.versioning.buildNumber,
        }
      }

      // Assign version numbers to assets
      assets = this.versionManager.assignAssetVersions(assets, 1)
      assets = await this.processAssetsForBundle(assets)

      // Get locales
      const locales = this.assetDetector.getLocalesFromAssets(assets)

      // Create Merkle tree
      const { tree, root } = this.versionManager.createMerkleTree(assets)

      // Generate manifest with versioning info
      const manifest = this.metadataGenerator.generateManifest(assets, bundleDefinition.displayName || bundleDefinition.name, {
        format: normalizedConfig.format,
        compression: normalizedConfig.compression,
        encryption: normalizedConfig.encryption,
        version: normalizedConfig.versioning.bundleVersion?.toString() || '1.0.0',
        buildNumber: normalizedConfig.versioning.buildNumber,
      })

      // Add versioning info to manifest
      manifest.bundleVersion = normalizedConfig.versioning.bundleVersion
      manifest.buildNumber = normalizedConfig.versioning.buildNumber
      manifest.merkleRoot = root
      manifest.runtimePackage = withRuntimePackageIntegrity(normalizedConfig.runtimePackage, root)

      // Add workspace metadata
      ;(manifest as any).workspaceBundle = {
        name: bundleDefinition.name,
        displayName: bundleDefinition.displayName,
        priority: bundleDefinition.priority,
        dependencies: bundleDefinition.dependencies,
        loadTrigger: bundleDefinition.loadTrigger,
      }

      // Validate manifest
      if (!this.metadataGenerator.validateManifest(manifest)) {
        throw new Error('Generated manifest is invalid')
      }

      // Generate temporary bundle path
      const tempBundlePath = `${normalizedConfig.output}.tmp`

      // Ensure output directory exists
      await mkdir(dirname(normalizedConfig.output), { recursive: true })

      // Create bundle based on format
      if (normalizedConfig.format === 'zip') {
        const zipBundler = new ZipBundler()
        await zipBundler.createBundle(assets, manifest, tempBundlePath)
      }
      else {
        const qpkBundler = new QPKBundler(
          [],
          normalizedConfig.encryption.algorithm,
          normalizedConfig.encryption.key,
          normalizedConfig.encryption.plugin,
        )
        await qpkBundler.createBundle(assets, manifest, tempBundlePath, {
          compress: normalizedConfig.compression.algorithm !== 'none',
          encrypt: normalizedConfig.encryption.enabled,
          compressionLevel: normalizedConfig.compression.level,
        })
      }

      // Generate final bundle filename with hash
      const finalBundlePath = this.versionManager.generateBundleFilename(
        normalizedConfig.output,
        normalizedConfig.versioning.bundleVersion,
        normalizedConfig.versioning.buildNumber,
      )

      // Rename temporary bundle to final name
      await rename(tempBundlePath, finalBundlePath)

      // Create build log
      const buildLog: BuildLog = {
        buildNumber: normalizedConfig.versioning.buildNumber,
        bundleVersion: normalizedConfig.versioning.bundleVersion,
        timestamp: new Date().toISOString(),
        bundlePath: finalBundlePath,
        bundleHash: '', // Will be calculated by versionManager
        totalFiles: assets.length,
        totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
        assets: Object.fromEntries(
          assets.map(asset => [asset.relativePath, {
            hash: asset.hash,
            size: asset.size,
            version: asset.version || 1,
            mtime: asset.mtime || Date.now(),
          }]),
        ),
        merkleTree: tree,
        merkleRoot: root,
        buildStats: {
          processingTime: Date.now() - startTime,
          compressionRatio: 0, // Will be calculated later
          locales: locales.map(l => l.code),
        },
      }

      // Save build log and update workspace index
      await this.versionManager.saveBuildLog(buildLog, finalBundlePath, manifest)
      await this.versionManager.updateBundleInWorkspace(
        bundleDefinition.name,
        buildLog,
        finalBundlePath,
        manifest,
        bundleDefinition,
      )

      // Call post-bundle hooks
      await this.pluginManager.postBundle(finalBundlePath, manifest)

      // Calculate stats
      const endTime = Date.now()
      const stats = this.calculateStats(manifest, endTime - startTime)

      logger.info(`Bundle "${bundleDefinition.name}" created successfully in ${endTime - startTime}ms`)
      logger.info(`Final bundle: ${finalBundlePath}`)

      return stats
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
      plugins: config.plugins || [],
      ignore: config.ignore || [],
      verbose: config.verbose || false,
      runtimePackage: config.runtimePackage,
    }
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
        ? compileQuaScriptModuleToTs(source, {
            hotReload: false,
            projectRoot: config.source,
            runtimeModule,
          })
        : compileLocalizedQuaScriptModuleToTs({
            baseSource: await readFile(baseAsset.path, 'utf8'),
            localizedSource: source,
            locale,
            projectRoot: config.source,
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
        id: `${runtimePackage.id}.${assetName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_.-]+/g, '.')}`,
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
  return `${runtimePackage.id}.${assetName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_.-]+/g, '.')}`
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
