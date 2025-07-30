import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { createLogger } from '@quajs/logger'
import { ZipBundler } from './zip-bundler.js'
import { QPKBundler } from './qpk-bundler.js'
import { MetadataGenerator } from './metadata.js'
import { VersionManager } from './versioning.js'
import type { 
  BuildLog, 
  AssetDiff, 
  PatchManifest, 
  PatchOptions,
  MultiBundlePatchOptions,
  BundleFormat,
  AssetInfo,
  QuackPlugin,
  EncryptionPlugin,
  EncryptionAlgorithm,
  WorkspaceBundleIndex
} from './types.js'

const logger = createLogger('quack:patch-generator')

export class PatchGenerator {
  private versionManager: VersionManager
  private metadataGenerator: MetadataGenerator

  constructor(outputDir?: string, workspaceMode: boolean = false) {
    this.versionManager = new VersionManager(outputDir, workspaceMode)
    this.metadataGenerator = new MetadataGenerator()
  }

  /**
   * Generate patch between two versions
   */
  async generatePatch(options: PatchOptions): Promise<void> {
    logger.info(`Generating patch from version ${options.fromVersion} to ${options.toVersion}`)

    // Analyze differences between versions
    const diffs = this.analyzeDifferences(options.fromBuildLog, options.toBuildLog)
    
    if (diffs.totalChanges === 0) {
      logger.info('No changes detected, skipping patch generation')
      return
    }

    logger.info(`Found ${diffs.totalChanges} changes (${diffs.added.length} added, ${diffs.modified.length} modified, ${diffs.deleted.length} deleted)`)

    // Collect assets that need to be included in patch
    const patchAssets = await this.collectPatchAssets(diffs, options.toBuildLog)

    // Create patch manifest
    const patchManifest = this.createPatchManifest(diffs, options)

    // Generate patch bundle
    await this.createPatchBundle(patchAssets, patchManifest, options)

    // Update bundle index with patch info
    await this.updateIndexWithPatch(options, patchManifest)

    logger.info(`Patch generated successfully: ${options.output}`)
  }

  /**
   * Analyze differences between two build logs
   */
  private analyzeDifferences(fromLog: BuildLog, toLog: BuildLog): {
    added: AssetDiff[]
    modified: AssetDiff[]
    deleted: AssetDiff[]
    totalChanges: number
  } {
    const added: AssetDiff[] = []
    const modified: AssetDiff[] = []
    const deleted: AssetDiff[] = []

    const fromAssets = new Map(Object.entries(fromLog.assets))
    const toAssets = new Map(Object.entries(toLog.assets))

    // Find added and modified files
    for (const [path, newAsset] of toAssets) {
      const oldAsset = fromAssets.get(path)
      
      if (!oldAsset) {
        // File was added
        added.push({
          path,
          operation: 'added',
          newHash: newAsset.hash,
          newVersion: newAsset.version,
          size: newAsset.size
        })
      } else if (oldAsset.hash !== newAsset.hash) {
        // File was modified
        modified.push({
          path,
          operation: 'modified',
          oldHash: oldAsset.hash,
          newHash: newAsset.hash,
          oldVersion: oldAsset.version,
          newVersion: newAsset.version,
          size: newAsset.size
        })
      }
    }

    // Find deleted files
    for (const [path, oldAsset] of fromAssets) {
      if (!toAssets.has(path)) {
        deleted.push({
          path,
          operation: 'deleted',
          oldHash: oldAsset.hash,
          oldVersion: oldAsset.version,
          size: oldAsset.size
        })
      }
    }

    return {
      added,
      modified,
      deleted,
      totalChanges: added.length + modified.length + deleted.length
    }
  }

  /**
   * Collect assets that need to be included in patch
   */
  private async collectPatchAssets(
    diffs: { added: AssetDiff[]; modified: AssetDiff[]; deleted: AssetDiff[] },
    toBuildLog: BuildLog
  ): Promise<AssetInfo[]> {
    const patchAssets: AssetInfo[] = []

    // Collect added and modified files (deleted files don't need content)
    const filesToInclude = [...diffs.added, ...diffs.modified]

    for (const diff of filesToInclude) {
      const assetInfo = toBuildLog.assets[diff.path]
      if (assetInfo) {
        // Create AssetInfo for patch
        const patchAsset: AssetInfo = {
          path: diff.path,
          relativePath: diff.path,
          size: assetInfo.size,
          hash: assetInfo.hash,
          version: assetInfo.version,
          type: this.inferAssetType(diff.path),
          locales: ['default'], // Will be properly detected later
          mtime: assetInfo.mtime
        }

        patchAssets.push(patchAsset)
      }
    }

    return patchAssets
  }

  /**
   * Infer asset type from file path
   */
  private inferAssetType(path: string): AssetInfo['type'] {
    const lowerPath = path.toLowerCase()
    
    if (lowerPath.includes('/characters/') || lowerPath.startsWith('characters/')) {
      return 'characters'
    }
    if (lowerPath.includes('/images/') || lowerPath.startsWith('images/')) {
      return 'images'
    }
    if (lowerPath.includes('/audio/') || lowerPath.startsWith('audio/')) {
      return 'audio'
    }
    if (lowerPath.includes('/scripts/') || lowerPath.startsWith('scripts/')) {
      return 'scripts'
    }
    
    // Default based on extension
    const ext = path.split('.').pop()?.toLowerCase()
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      return 'images'
    }
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext || '')) {
      return 'audio'
    }
    if (['js', 'mjs', 'json'].includes(ext || '')) {
      return 'scripts'
    }
    
    return 'images' // Default fallback
  }

  /**
   * Create patch manifest
   */
  private createPatchManifest(
    diffs: { added: AssetDiff[]; modified: AssetDiff[]; deleted: AssetDiff[] },
    options: PatchOptions
  ): PatchManifest {
    return {
      version: '1.0.0',
      bundler: '@quajs/quack@0.1.0',
      created: new Date().toISOString(),
      format: options.format,
      isPatch: true,
      patchVersion: this.generatePatchVersion(options.fromVersion, options.toVersion),
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      compression: {
        algorithm: options.format === 'qpk' ? 'lzma' : 'deflate'
      },
      encryption: {
        enabled: false, // Patches typically don't need encryption
        algorithm: 'none'
      },
      locales: ['default'],
      defaultLocale: 'default',
      changes: {
        added: diffs.added,
        modified: diffs.modified,
        deleted: diffs.deleted
      },
      totalChanges: diffs.added.length + diffs.modified.length + diffs.deleted.length,
      totalSize: [...diffs.added, ...diffs.modified].reduce((sum, diff) => sum + (diff.size || 0), 0)
    }
  }

  /**
   * Generate patch version number
   */
  private generatePatchVersion(fromVersion: number, toVersion: number): number {
    // Simple patch version: combine from and to versions
    return parseInt(`${fromVersion}${toVersion.toString().padStart(3, '0')}`)
  }

  /**
   * Create patch bundle
   */
  private async createPatchBundle(
    patchAssets: AssetInfo[],
    patchManifest: PatchManifest,
    options: PatchOptions
  ): Promise<void> {
    // Ensure output directory exists
    await mkdir(dirname(options.output), { recursive: true })

    // Create bundle based on format
    if (options.format === 'zip') {
      const zipBundler = new ZipBundler([])
      await zipBundler.createBundle(patchAssets, patchManifest as any, options.output)
    } else {
      const qpkBundler = new QPKBundler([], 'none')
      await qpkBundler.createBundle(patchAssets, patchManifest as any, options.output, {
        compress: true,
        encrypt: false
      })
    }
  }

  /**
   * Update bundle index with patch information
   */
  private async updateIndexWithPatch(
    options: PatchOptions,
    patchManifest: PatchManifest
  ): Promise<void> {
    const patchStats = await stat(options.output)
    const patchBuffer = await readFile(options.output)
    const patchHash = createHash('sha256').update(patchBuffer).digest('hex')

    const patchInfo = {
      filename: basename(options.output),
      hash: patchHash,
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      patchVersion: patchManifest.patchVersion,
      created: patchManifest.created,
      size: patchStats.size,
      changeCount: patchManifest.totalChanges
    }

    await this.versionManager.addPatchToIndex(patchInfo)
  }

  /**
   * Apply patch to existing bundle (validation/simulation)
   */
  async validatePatch(patchPath: string, targetVersion: number): Promise<{
    valid: boolean
    errors: string[]
    changes: {
      willAdd: string[]
      willModify: string[]
      willDelete: string[]
    }
  }> {
    logger.info(`Validating patch: ${patchPath}`)

    try {
      // Read patch manifest
      let patchManifest: PatchManifest

      if (patchPath.endsWith('.qpk')) {
        const qpkBundler = new QPKBundler()
        const { manifest } = await qpkBundler.readBundle(patchPath)
        patchManifest = manifest as PatchManifest
      } else {
        const zipBundler = new ZipBundler()
        patchManifest = await zipBundler.extractBundle(patchPath, '/tmp/patch-validation') as PatchManifest
      }

      const errors: string[] = []

      // Validate patch format
      if (!patchManifest.isPatch) {
        errors.push('Bundle is not a patch package')
      }

      // Validate target version
      if (patchManifest.fromVersion !== targetVersion) {
        errors.push(`Patch is for version ${patchManifest.fromVersion}, but target is version ${targetVersion}`)
      }

      // Collect changes
      const changes = {
        willAdd: patchManifest.changes.added.map(diff => diff.path),
        willModify: patchManifest.changes.modified.map(diff => diff.path),
        willDelete: patchManifest.changes.deleted.map(diff => diff.path)
      }

      const valid = errors.length === 0

      if (valid) {
        logger.info(`Patch validation successful: ${patchManifest.totalChanges} changes`)
      } else {
        logger.error(`Patch validation failed: ${errors.join(', ')}`)
      }

      return { valid, errors, changes }
    } catch (error) {
      logger.error('Patch validation failed:', error)
      return {
        valid: false,
        errors: [`Failed to read patch: ${error.message}`],
        changes: { willAdd: [], willModify: [], willDelete: [] }
      }
    }
  }

  /**
   * List available patches for a version
   */
  async listAvailablePatches(fromVersion?: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
  }>> {
    const index = await this.versionManager.getBundleIndex()
    if (!index) {
      return []
    }

    let patches = index.availablePatches

    // Filter by from version if specified
    if (fromVersion !== undefined) {
      patches = patches.filter(patch => patch.fromVersion === fromVersion)
    }

    return patches
  }

  /**
   * Get patch chain from one version to another
   */
  async getPatchChain(fromVersion: number, toVersion: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    patchVersion: number
  }> | null> {
    const availablePatches = await this.listAvailablePatches()
    
    // Simple implementation: direct patch
    const directPatch = availablePatches.find(
      patch => patch.fromVersion === fromVersion && patch.toVersion === toVersion
    )

    if (directPatch) {
      return [directPatch]
    }

    // TODO: Implement multi-step patch chain resolution
    // This would find a series of patches that can update from fromVersion to toVersion
    
    return null
  }

  // ==== WORKSPACE METHODS ====

  /**
   * Generate patch for specific bundle in workspace
   */
  async generateWorkspaceBundlePatch(options: MultiBundlePatchOptions): Promise<void> {
    logger.info(`Generating workspace patch for bundle "${options.bundleName}" from version ${options.fromVersion} to ${options.toVersion}`)

    // Analyze differences between versions
    const diffs = this.analyzeDifferences(options.fromBuildLog, options.toBuildLog)
    
    if (diffs.totalChanges === 0) {
      logger.info('No changes detected, skipping patch generation')
      return
    }

    logger.info(`Found ${diffs.totalChanges} changes in bundle "${options.bundleName}" (${diffs.added.length} added, ${diffs.modified.length} modified, ${diffs.deleted.length} deleted)`)

    // Collect assets that need to be included in patch
    const patchAssets = await this.collectPatchAssets(diffs, options.toBuildLog)

    // Create patch manifest for workspace bundle
    const patchManifest = this.createWorkspaceBundlePatchManifest(diffs, options)

    // Generate patch bundle
    await this.createPatchBundle(patchAssets, patchManifest, options)

    // Update workspace index with patch info
    await this.updateWorkspaceIndexWithPatch(options, patchManifest)

    logger.info(`Workspace bundle patch generated successfully: ${options.output}`)
  }

  /**
   * Create patch manifest for workspace bundle
   */
  private createWorkspaceBundlePatchManifest(
    diffs: { added: AssetDiff[]; modified: AssetDiff[]; deleted: AssetDiff[] },
    options: MultiBundlePatchOptions
  ): PatchManifest {
    return {
      version: '1.0.0',
      bundler: '@quajs/quack@0.1.0',
      created: new Date().toISOString(),
      format: options.format,
      isPatch: true,
      patchVersion: this.generatePatchVersion(options.fromVersion, options.toVersion),
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      compression: {
        algorithm: options.format === 'qpk' ? 'lzma' : 'deflate'
      },
      encryption: {
        enabled: false,
        algorithm: 'none'
      },
      locales: ['default'],
      defaultLocale: 'default',
      changes: {
        added: diffs.added,
        modified: diffs.modified,
        deleted: diffs.deleted
      },
      totalChanges: diffs.added.length + diffs.modified.length + diffs.deleted.length,
      totalSize: [...diffs.added, ...diffs.modified].reduce((sum, diff) => sum + (diff.size || 0), 0),
      // Workspace-specific metadata
      workspaceBundle: {
        name: options.bundleName,
        fromBuild: options.fromBuildLog.buildNumber,
        toBuild: options.toBuildLog.buildNumber
      }
    }
  }

  /**
   * Update workspace index with patch information
   */
  private async updateWorkspaceIndexWithPatch(
    options: MultiBundlePatchOptions,
    patchManifest: PatchManifest
  ): Promise<void> {
    const patchStats = await stat(options.output)
    const patchBuffer = await readFile(options.output)
    const patchHash = createHash('sha256').update(patchBuffer).digest('hex')

    const patchInfo = {
      filename: basename(options.output),
      hash: patchHash,
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      patchVersion: patchManifest.patchVersion,
      created: patchManifest.created,
      size: patchStats.size,
      changeCount: patchManifest.totalChanges
    }

    await this.versionManager.addPatchToWorkspace(options.bundleName, patchInfo)
  }

  /**
   * List available patches for a specific bundle in workspace
   */
  async listWorkspaceBundlePatches(bundleName: string, fromVersion?: number): Promise<Array<{
    filename: string
    fromVersion: number
    toVersion: number
    patchVersion: number
    created: string
    size: number
    changeCount: number
  }>> {
    const bundleInfo = await this.versionManager.getWorkspaceBundleInfo(bundleName)
    if (!bundleInfo) {
      return []
    }

    let patches = bundleInfo.availablePatches

    // Filter by from version if specified
    if (fromVersion !== undefined) {
      patches = patches.filter(patch => patch.fromVersion === fromVersion)
    }

    return patches
  }

  /**
   * List all patches in workspace
   */
  async listWorkspacePatches(): Promise<{
    bundlePatches: Record<string, Array<{
      filename: string
      fromVersion: number
      toVersion: number
      patchVersion: number
      created: string
      size: number
      changeCount: number
    }>>
    globalPatches: Array<{
      filename: string
      fromVersion: number
      toVersion: number
      patchVersion: number
      created: string
      size: number
      changeCount: number
      affectedBundles: string[]
    }>
  }> {
    const index = await this.versionManager.getWorkspaceIndex()
    if (!index) {
      return { bundlePatches: {}, globalPatches: [] }
    }

    const bundlePatches: Record<string, any[]> = {}
    for (const [bundleName, bundleInfo] of Object.entries(index.bundles)) {
      bundlePatches[bundleName] = bundleInfo.availablePatches
    }

    return {
      bundlePatches,
      globalPatches: index.globalPatches
    }
  }

  /**
   * Validate workspace bundle patch
   */
  async validateWorkspaceBundlePatch(
    patchPath: string, 
    bundleName: string, 
    targetVersion: number
  ): Promise<{
    valid: boolean
    errors: string[]
    changes: {
      willAdd: string[]
      willModify: string[]
      willDelete: string[]
    }
    bundleInfo?: {
      name: string
      fromBuild: string
      toBuild: string
    }
  }> {
    logger.info(`Validating workspace patch for bundle "${bundleName}": ${patchPath}`)

    try {
      // Read patch manifest
      let patchManifest: PatchManifest & { workspaceBundle?: any }

      if (patchPath.endsWith('.qpk')) {
        const qpkBundler = new QPKBundler()
        const { manifest } = await qpkBundler.readBundle(patchPath)
        patchManifest = manifest as any
      } else {
        const zipBundler = new ZipBundler()
        patchManifest = await zipBundler.extractBundle(patchPath, '/tmp/patch-validation') as any
      }

      const errors: string[] = []

      // Validate patch format
      if (!patchManifest.isPatch) {
        errors.push('Bundle is not a patch package')
      }

      // Validate workspace bundle info
      if (patchManifest.workspaceBundle?.name !== bundleName) {
        errors.push(`Patch is for bundle "${patchManifest.workspaceBundle?.name}", but expected "${bundleName}"`)
      }

      // Validate target version
      if (patchManifest.fromVersion !== targetVersion) {
        errors.push(`Patch is for version ${patchManifest.fromVersion}, but target is version ${targetVersion}`)
      }

      // Collect changes
      const changes = {
        willAdd: patchManifest.changes.added.map(diff => diff.path),
        willModify: patchManifest.changes.modified.map(diff => diff.path),
        willDelete: patchManifest.changes.deleted.map(diff => diff.path)
      }

      const valid = errors.length === 0

      if (valid) {
        logger.info(`Workspace patch validation successful: ${patchManifest.totalChanges} changes for bundle "${bundleName}"`)
      } else {
        logger.error(`Workspace patch validation failed: ${errors.join(', ')}`)
      }

      return { 
        valid, 
        errors, 
        changes,
        bundleInfo: patchManifest.workspaceBundle
      }
    } catch (error) {
      logger.error('Workspace patch validation failed:', error)
      return {
        valid: false,
        errors: [`Failed to read patch: ${error.message}`],
        changes: { willAdd: [], willModify: [], willDelete: [] }
      }
    }
  }

  /**
   * Get workspace bundle build logs for patch generation
   */
  async getWorkspaceBundleBuildLogs(bundleName: string, fromVersion: number, toVersion: number): Promise<{
    fromBuildLog: BuildLog | null
    toBuildLog: BuildLog | null
  }> {
    const fromBuildLog = await this.versionManager.getWorkspaceBundleBuildLog(bundleName, fromVersion)
    const toBuildLog = await this.versionManager.getWorkspaceBundleBuildLog(bundleName, toVersion)

    return { fromBuildLog, toBuildLog }
  }
}