import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { createLogger } from '@quajs/logger'
import type { 
  VersionConfig, 
  BuildLog, 
  BundleIndex,
  WorkspaceBundleIndex,
  BundleInfo,
  MerkleNode, 
  AssetInfo,
  BundleManifest 
} from '../core/types'

const logger = createLogger('quack:versioning')

export class VersionManager {
  private versionFile: string
  private buildLogDir: string
  private indexFile: string
  private workspaceIndexFile: string
  private isWorkspaceMode: boolean

  constructor(outputDir?: string, workspaceMode: boolean = false) {
    const baseDir = outputDir || process.cwd()
    this.versionFile = join(baseDir, '.quack-version.json')
    this.buildLogDir = join(baseDir, '.quack-logs')
    this.indexFile = join(baseDir, 'index.json')
    this.workspaceIndexFile = join(baseDir, 'workspace-index.json')
    this.isWorkspaceMode = workspaceMode
  }

  /**
   * Get or create version information
   */
  async getVersionInfo(config: VersionConfig): Promise<{ bundleVersion: number; buildNumber: string }> {
    let bundleVersion = config.bundleVersion || 1
    let buildNumber = config.buildNumber || this.generateBuildNumber()

    // Read existing version file if it exists
    if (existsSync(this.versionFile)) {
      try {
        const versionData = JSON.parse(await readFile(this.versionFile, 'utf8'))
        
        if (config.incrementVersion) {
          bundleVersion = (versionData.bundleVersion || 0) + 1
        } else if (!config.bundleVersion) {
          bundleVersion = versionData.bundleVersion || 1
        }

        // Use stored build number if not provided
        if (!config.buildNumber && versionData.buildNumber) {
          buildNumber = this.generateBuildNumber() // Always generate new build number
        }
      } catch (error) {
        logger.warn('Failed to read version file, using defaults:', error)
      }
    }

    // Save updated version info
    await this.saveVersionInfo({ bundleVersion, buildNumber })

    logger.info(`Bundle version: ${bundleVersion}, Build: ${buildNumber}`)
    return { bundleVersion, buildNumber }
  }

  /**
   * Generate a build number
   */
  private generateBuildNumber(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const random = Math.random().toString(36).substring(2, 8)
    return `${timestamp}-${random}`
  }

  /**
   * Save version information
   */
  private async saveVersionInfo(version: { bundleVersion: number; buildNumber: string }): Promise<void> {
    const versionData = {
      bundleVersion: version.bundleVersion,
      buildNumber: version.buildNumber,
      lastUpdated: new Date().toISOString()
    }

    await mkdir(dirname(this.versionFile), { recursive: true })
    await writeFile(this.versionFile, JSON.stringify(versionData, null, 2), 'utf8')
  }

  /**
   * Create Merkle tree from assets
   */
  createMerkleTree(assets: AssetInfo[]): { tree: MerkleNode; root: string } {
    if (assets.length === 0) {
      const emptyNode: MerkleNode = {
        hash: createHash('sha256').update('').digest('hex'),
        isLeaf: true
      }
      return { tree: emptyNode, root: emptyNode.hash }
    }

    // Create leaf nodes from assets (sorted for consistency)
    const sortedAssets = assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    let nodes: MerkleNode[] = sortedAssets.map(asset => ({
      hash: asset.hash,
      path: asset.relativePath,
      isLeaf: true
    }))

    // Build tree from bottom up
    while (nodes.length > 1) {
      const nextLevel: MerkleNode[] = []
      
      for (let i = 0; i < nodes.length; i += 2) {
        const left = nodes[i]
        const right = nodes[i + 1]
        
        if (right) {
          // Combine two nodes
          const combinedHash = createHash('sha256')
            .update(left.hash)
            .update(right.hash)
            .digest('hex')
          
          nextLevel.push({
            hash: combinedHash,
            left,
            right,
            isLeaf: false
          })
        } else {
          // Odd number of nodes, promote the last one
          nextLevel.push(left)
        }
      }
      
      nodes = nextLevel
    }

    const root = nodes[0]
    return { tree: root, root: root.hash }
  }

  /**
   * Generate file hash for bundle filename
   */
  generateFileHash(bundlePath: string, bundleVersion: number, buildNumber: string): string {
    const contentHash = createHash('sha256')
      .update(bundleVersion.toString())
      .update(buildNumber)
      .update(bundlePath)
      .digest('hex')
    
    return contentHash.substring(0, 8) // 8 character hash like webpack
  }

  /**
   * Generate versioned bundle filename
   */
  generateBundleFilename(originalPath: string, bundleVersion: number, buildNumber: string): string {
    const dir = dirname(originalPath)
    const ext = extname(originalPath)
    const name = basename(originalPath, ext)
    
    const fileHash = this.generateFileHash(originalPath, bundleVersion, buildNumber)
    
    return join(dir, `${name}.${fileHash}${ext}`)
  }

  /**
   * Save build log
   */
  async saveBuildLog(
    buildLog: BuildLog,
    bundlePath: string,
    manifest: BundleManifest
  ): Promise<void> {
    // Ensure build log directory exists
    await mkdir(this.buildLogDir, { recursive: true })

    // Calculate bundle file hash
    const bundleStats = await stat(bundlePath)
    const bundleBuffer = await readFile(bundlePath)
    const bundleHash = createHash('sha256').update(bundleBuffer).digest('hex')

    // Complete build log
    const completeBuildLog: BuildLog = {
      ...buildLog,
      bundlePath,
      bundleHash,
      merkleRoot: manifest.merkleRoot || '',
      timestamp: new Date().toISOString()
    }

    // Save build log
    const logFile = join(this.buildLogDir, `${buildLog.buildNumber}.json`)
    await writeFile(logFile, JSON.stringify(completeBuildLog, null, 2), 'utf8')

    logger.info(`Build log saved: ${logFile}`)

    // Update bundle index
    await this.updateBundleIndex(bundlePath, completeBuildLog)
  }

  /**
   * Update bundle index file
   */
  private async updateBundleIndex(bundlePath: string, buildLog: BuildLog): Promise<void> {
    let index: BundleIndex

    // Load existing index or create new one
    if (existsSync(this.indexFile)) {
      try {
        index = JSON.parse(await readFile(this.indexFile, 'utf8'))
      } catch (error) {
        logger.warn('Failed to read index file, creating new one:', error)
        index = this.createEmptyIndex()
      }
    } else {
      index = this.createEmptyIndex()
    }

    const bundleStats = await stat(bundlePath)
    const bundleInfo = {
      filename: basename(bundlePath),
      hash: buildLog.bundleHash,
      version: buildLog.bundleVersion,
      buildNumber: buildLog.buildNumber,
      created: buildLog.timestamp,
      size: bundleStats.size
    }

    // Move current latest to previous builds if it exists
    if (index.latestBundle) {
      index.previousBuilds.unshift(index.latestBundle)
      // Keep only last 10 builds
      index.previousBuilds = index.previousBuilds.slice(0, 10)
    }

    // Update current info
    index.currentVersion = buildLog.bundleVersion
    index.currentBuild = buildLog.buildNumber
    index.latestBundle = bundleInfo

    // Save updated index
    await writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf8')
    logger.info(`Bundle index updated: ${this.indexFile}`)
  }

  /**
   * Create empty bundle index
   */
  private createEmptyIndex(): BundleIndex {
    return {
      currentVersion: 0,
      currentBuild: '',
      latestBundle: null as any,
      previousBuilds: [],
      availablePatches: []
    }
  }

  /**
   * Get build log by build number
   */
  async getBuildLog(buildNumber: string): Promise<BuildLog | null> {
    const logFile = join(this.buildLogDir, `${buildNumber}.json`)
    
    if (!existsSync(logFile)) {
      return null
    }

    try {
      const logData = await readFile(logFile, 'utf8')
      return JSON.parse(logData)
    } catch (error) {
      logger.error(`Failed to read build log: ${buildNumber}`, error)
      return null
    }
  }

  /**
   * Get build log by version
   */
  async getBuildLogByVersion(version: number): Promise<BuildLog | null> {
    // Read index to find build number for version
    if (!existsSync(this.indexFile)) {
      return null
    }

    try {
      const index: BundleIndex = JSON.parse(await readFile(this.indexFile, 'utf8'))
      
      // Check current version
      if (index.latestBundle && index.latestBundle.version === version) {
        return this.getBuildLog(index.latestBundle.buildNumber)
      }

      // Check previous builds
      const previousBuild = index.previousBuilds.find(build => build.version === version)
      if (previousBuild) {
        return this.getBuildLog(previousBuild.buildNumber)
      }

      return null
    } catch (error) {
      logger.error(`Failed to find build log for version: ${version}`, error)
      return null
    }
  }

  /**
   * List available build logs
   */
  async listBuildLogs(): Promise<BuildLog[]> {
    if (!existsSync(this.buildLogDir)) {
      return []
    }

    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir(this.buildLogDir)
      const logFiles = files.filter(file => file.endsWith('.json'))

      const logs: BuildLog[] = []
      for (const file of logFiles) {
        try {
          const logData = await readFile(join(this.buildLogDir, file), 'utf8')
          logs.push(JSON.parse(logData))
        } catch (error) {
          logger.warn(`Failed to read log file: ${file}`, error)
        }
      }

      // Sort by version and timestamp
      return logs.sort((a, b) => {
        if (a.bundleVersion !== b.bundleVersion) {
          return b.bundleVersion - a.bundleVersion
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
    } catch (error) {
      logger.error('Failed to list build logs:', error)
      return []
    }
  }

  /**
   * Get bundle index
   */
  async getBundleIndex(): Promise<BundleIndex | null> {
    if (!existsSync(this.indexFile)) {
      return null
    }

    try {
      const indexData = await readFile(this.indexFile, 'utf8')
      return JSON.parse(indexData)
    } catch (error) {
      logger.error('Failed to read bundle index:', error)
      return null
    }
  }

  /**
   * Add patch to index
   */
  async addPatchToIndex(patchInfo: BundleIndex['availablePatches'][0]): Promise<void> {
    let index = await this.getBundleIndex()
    if (!index) {
      index = this.createEmptyIndex()
    }

    // Add patch info
    index.availablePatches.push(patchInfo)
    
    // Sort patches by version
    index.availablePatches.sort((a, b) => {
      if (a.fromVersion !== b.fromVersion) {
        return b.fromVersion - a.fromVersion
      }
      return b.toVersion - a.toVersion
    })

    // Save updated index
    await writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf8')
    logger.info('Patch added to index')
  }

  /**
   * Assign version numbers to assets
   */
  assignAssetVersions(assets: AssetInfo[], baseVersion: number = 1): AssetInfo[] {
    return assets.map((asset, index) => ({
      ...asset,
      version: baseVersion + index
    }))
  }

  // ==== WORKSPACE METHODS ====

  /**
   * Get or create workspace bundle index
   */
  async getWorkspaceIndex(): Promise<WorkspaceBundleIndex | null> {
    if (!existsSync(this.workspaceIndexFile)) {
      return null
    }

    try {
      const indexData = await readFile(this.workspaceIndexFile, 'utf8')
      return JSON.parse(indexData)
    } catch (error) {
      logger.error('Failed to read workspace index:', error)
      return null
    }
  }

  /**
   * Initialize or update workspace index
   */
  async initializeWorkspaceIndex(workspaceName: string, workspaceVersion: string): Promise<WorkspaceBundleIndex> {
    let index = await this.getWorkspaceIndex()
    
    if (!index) {
      index = this.createEmptyWorkspaceIndex(workspaceName, workspaceVersion)
      logger.info(`Created new workspace index for "${workspaceName}"`)
    } else {
      // Update workspace metadata
      index.workspace.version = workspaceVersion
      index.workspace.updated = new Date().toISOString()
      logger.info(`Updated workspace index for "${workspaceName}"`)
    }

    await this.saveWorkspaceIndex(index)
    return index
  }

  /**
   * Update bundle in workspace index
   */
  async updateBundleInWorkspace(
    bundleName: string,
    buildLog: BuildLog,
    bundlePath: string,
    manifest: BundleManifest,
    bundleDefinition: any
  ): Promise<void> {
    let index = await this.getWorkspaceIndex()
    if (!index) {
      throw new Error('Workspace index not found. Initialize workspace first.')
    }

    // Calculate bundle hash
    const bundleBuffer = await readFile(bundlePath)
    const bundleHash = createHash('sha256').update(bundleBuffer).digest('hex')
    const bundleStats = await stat(bundlePath)

    // Get or create bundle info
    let bundleInfo = index.bundles[bundleName]
    if (!bundleInfo) {
      bundleInfo = this.createEmptyBundleInfo(bundleName, bundleDefinition)
      index.bundles[bundleName] = bundleInfo
    }

    // Move current latest to previous builds
    if (bundleInfo.latestBundle) {
      bundleInfo.previousBuilds.unshift(bundleInfo.latestBundle)
      // Keep only last 10 builds
      bundleInfo.previousBuilds = bundleInfo.previousBuilds.slice(0, 10)
    }

    // Update bundle info
    bundleInfo.currentVersion = buildLog.bundleVersion
    bundleInfo.currentBuild = buildLog.buildNumber
    bundleInfo.latestBundle = {
      filename: basename(bundlePath),
      hash: bundleHash,
      version: buildLog.bundleVersion,
      buildNumber: buildLog.buildNumber,
      created: buildLog.timestamp,
      size: bundleStats.size
    }

    // Update workspace global version if this bundle has the highest version
    if (buildLog.bundleVersion > index.currentVersion) {
      index.currentVersion = buildLog.bundleVersion
      index.currentBuild = buildLog.buildNumber
    }

    await this.saveWorkspaceIndex(index)
    logger.info(`Updated bundle "${bundleName}" in workspace index`)
  }

  /**
   * Add patch to workspace index
   */
  async addPatchToWorkspace(
    bundleName: string,
    patchInfo: {
      filename: string
      hash: string
      fromVersion: number
      toVersion: number
      patchVersion: number
      created: string
      size: number
      changeCount: number
    }
  ): Promise<void> {
    let index = await this.getWorkspaceIndex()
    if (!index) {
      throw new Error('Workspace index not found')
    }

    // Add to specific bundle patches
    if (index.bundles[bundleName]) {
      const existingPatch = index.bundles[bundleName].availablePatches.find(
        p => p.fromVersion === patchInfo.fromVersion && p.toVersion === patchInfo.toVersion
      )

      if (!existingPatch) {
        index.bundles[bundleName].availablePatches.push(patchInfo)
        
        // Sort patches by version
        index.bundles[bundleName].availablePatches.sort((a, b) => {
          if (a.fromVersion !== b.fromVersion) {
            return b.fromVersion - a.fromVersion
          }
          return b.toVersion - a.toVersion
        })

        logger.info(`Added patch for bundle "${bundleName}" (v${patchInfo.fromVersion} → v${patchInfo.toVersion})`)
      }
    }

    // Add to global patches (affects multiple bundles)
    const globalPatchInfo = {
      ...patchInfo,
      affectedBundles: [bundleName]
    }

    const existingGlobalPatch = index.globalPatches.find(
      p => p.fromVersion === patchInfo.fromVersion && 
          p.toVersion === patchInfo.toVersion && 
          p.affectedBundles.includes(bundleName)
    )

    if (!existingGlobalPatch) {
      index.globalPatches.push(globalPatchInfo)
      
      // Sort global patches
      index.globalPatches.sort((a, b) => {
        if (a.fromVersion !== b.fromVersion) {
          return b.fromVersion - a.fromVersion
        }
        return b.toVersion - a.toVersion
      })
    }

    await this.saveWorkspaceIndex(index)
  }

  /**
   * Get bundle build log in workspace context
   */
  async getWorkspaceBundleBuildLog(bundleName: string, version: number): Promise<BuildLog | null> {
    const index = await this.getWorkspaceIndex()
    if (!index || !index.bundles[bundleName]) {
      return null
    }

    const bundleInfo = index.bundles[bundleName]
    
    // Check current version
    if (bundleInfo.latestBundle && bundleInfo.latestBundle.version === version) {
      return this.getBuildLog(bundleInfo.latestBundle.buildNumber)
    }

    // Check previous builds
    for (const build of bundleInfo.previousBuilds) {
      if (build.version === version) {
        return this.getBuildLog(build.buildNumber)
      }
    }

    return null
  }

  /**
   * List available bundles in workspace
   */
  async getWorkspaceBundles(): Promise<string[]> {
    const index = await this.getWorkspaceIndex()
    return index ? Object.keys(index.bundles) : []
  }

  /**
   * Get bundle info from workspace
   */
  async getWorkspaceBundleInfo(bundleName: string): Promise<BundleInfo | null> {
    const index = await this.getWorkspaceIndex()
    return index?.bundles[bundleName] || null
  }

  /**
   * Save workspace index
   */
  private async saveWorkspaceIndex(index: WorkspaceBundleIndex): Promise<void> {
    await mkdir(dirname(this.workspaceIndexFile), { recursive: true })
    await writeFile(this.workspaceIndexFile, JSON.stringify(index, null, 2), 'utf8')
  }

  /**
   * Create empty workspace index
   */
  private createEmptyWorkspaceIndex(name: string, version: string): WorkspaceBundleIndex {
    return {
      workspace: {
        name,
        version,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      },
      currentVersion: 0,
      currentBuild: '',
      bundles: {},
      globalPatches: []
    }
  }

  /**
   * Create empty bundle info
   */
  private createEmptyBundleInfo(bundleName: string, bundleDefinition: any): BundleInfo {
    return {
      name: bundleName,
      displayName: bundleDefinition?.displayName || bundleName,
      currentVersion: 0,
      currentBuild: '',
      priority: bundleDefinition?.priority || 0,
      dependencies: bundleDefinition?.dependencies || [],
      loadTrigger: bundleDefinition?.loadTrigger || 'immediate',
      latestBundle: null as any,
      previousBuilds: [],
      availablePatches: []
    }
  }
}