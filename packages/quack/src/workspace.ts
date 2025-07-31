import { readFile, access, stat } from 'node:fs/promises'
import { resolve, join, dirname, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { createLogger } from '@quajs/logger'
import type { 
  WorkspaceConfig, 
  BundleDefinition, 
  QuackConfig, 
  BundleFormat,
  CompressionAlgorithm,
  EncryptionAlgorithm 
} from './types'

const logger = createLogger('quack:workspace')

export class WorkspaceManager {
  private workspaceRoot: string
  private config: WorkspaceConfig | null = null

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = resolve(workspaceRoot)
  }

  /**
   * Load workspace configuration from file
   */
  async loadConfig(configPath?: string): Promise<WorkspaceConfig> {
    const configFile = configPath || this.findConfigFile()
    
    if (!configFile) {
      throw new Error('No workspace configuration file found. Expected quack.workspace.js or quack.workspace.json')
    }

    logger.info(`Loading workspace config: ${configFile}`)

    try {
      let config: WorkspaceConfig

      if (configFile.endsWith('.json')) {
        const content = await readFile(configFile, 'utf8')
        config = JSON.parse(content)
      } else {
        // Dynamic import for JS config files
        const configModule = await import(`file://${configFile}`)
        config = configModule.default || configModule
      }

      // Validate and normalize configuration
      config = await this.validateAndNormalizeConfig(config)
      this.config = config

      logger.info(`Loaded workspace "${config.name}" with ${config.bundles.length} bundles`)
      return config

    } catch (error) {
      throw new Error(`Failed to load workspace config from ${configFile}: ${error.message}`)
    }
  }

  /**
   * Find workspace configuration file
   */
  private findConfigFile(): string | null {
    const candidates = [
      'quack.workspace.js',
      'quack.workspace.json',
      'workspace.config.js',
      'workspace.config.json'
    ]

    for (const candidate of candidates) {
      const fullPath = resolve(this.workspaceRoot, candidate)
      if (existsSync(fullPath)) {
        return fullPath
      }
    }

    return null
  }

  /**
   * Validate and normalize workspace configuration
   */
  private async validateAndNormalizeConfig(config: WorkspaceConfig): Promise<WorkspaceConfig> {
    if (!config.name) {
      throw new Error('Workspace configuration must have a name')
    }

    if (!config.bundles || !Array.isArray(config.bundles) || config.bundles.length === 0) {
      throw new Error('Workspace configuration must have at least one bundle definition')
    }

    // Validate bundle definitions
    const bundleNames = new Set<string>()
    for (let i = 0; i < config.bundles.length; i++) {
      const bundle = config.bundles[i]
      
      if (!bundle.name) {
        throw new Error(`Bundle at index ${i} must have a name`)
      }

      if (bundleNames.has(bundle.name)) {
        throw new Error(`Duplicate bundle name: ${bundle.name}`)
      }
      bundleNames.add(bundle.name)

      if (!bundle.source) {
        throw new Error(`Bundle "${bundle.name}" must have a source directory`)
      }

      // Resolve source path relative to workspace root
      const sourcePath = resolve(this.workspaceRoot, bundle.source)
      try {
        const sourceStat = await stat(sourcePath)
        if (!sourceStat.isDirectory()) {
          throw new Error(`Bundle "${bundle.name}" source is not a directory: ${sourcePath}`)
        }
      } catch (error) {
        throw new Error(`Bundle "${bundle.name}" source directory not found: ${sourcePath}`)
      }

      // Normalize bundle definition
      config.bundles[i] = this.normalizeBundleDefinition(bundle, config)
    }

    // Validate dependencies
    this.validateBundleDependencies(config.bundles)

    // Set defaults
    config.version = config.version || '1.0.0'
    config.output = config.output || resolve(this.workspaceRoot, 'dist')

    return config
  }

  /**
   * Normalize individual bundle definition
   */
  private normalizeBundleDefinition(bundle: BundleDefinition, workspaceConfig: WorkspaceConfig): BundleDefinition {
    return {
      ...bundle,
      displayName: bundle.displayName || bundle.name,
      priority: bundle.priority ?? 0,
      dependencies: bundle.dependencies || [],
      loadTrigger: bundle.loadTrigger || 'immediate',
      description: bundle.description || `Bundle: ${bundle.name}`,
      
      // Inherit from global settings if not specified
      format: bundle.format || workspaceConfig.globalSettings?.compression?.algorithm === 'lzma' ? 'qpk' : 'zip',
      compression: {
        level: bundle.compression?.level ?? workspaceConfig.globalSettings?.compression?.level ?? 6,
        algorithm: bundle.compression?.algorithm ?? workspaceConfig.globalSettings?.compression?.algorithm ?? 'deflate'
      },
      encryption: {
        enabled: bundle.encryption?.enabled ?? workspaceConfig.globalSettings?.encryption?.enabled ?? false,
        algorithm: bundle.encryption?.algorithm ?? workspaceConfig.globalSettings?.encryption?.algorithm ?? 'xor',
        key: bundle.encryption?.key ?? workspaceConfig.globalSettings?.encryption?.key
      }
    }
  }

  /**
   * Validate bundle dependencies
   */
  private validateBundleDependencies(bundles: BundleDefinition[]): void {
    const bundleNames = new Set(bundles.map(b => b.name))
    
    for (const bundle of bundles) {
      for (const dep of bundle.dependencies || []) {
        if (!bundleNames.has(dep)) {
          throw new Error(`Bundle "${bundle.name}" depends on non-existent bundle "${dep}"`)
        }
      }
    }

    // Check for circular dependencies (simple check)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (bundleName: string): boolean => {
      if (recursionStack.has(bundleName)) {
        return true
      }
      if (visited.has(bundleName)) {
        return false
      }

      visited.add(bundleName)
      recursionStack.add(bundleName)

      const bundle = bundles.find(b => b.name === bundleName)
      if (bundle) {
        for (const dep of bundle.dependencies || []) {
          if (hasCycle(dep)) {
            return true
          }
        }
      }

      recursionStack.delete(bundleName)
      return false
    }

    for (const bundle of bundles) {
      if (hasCycle(bundle.name)) {
        throw new Error(`Circular dependency detected involving bundle "${bundle.name}"`)
      }
    }
  }

  /**
   * Get bundle definition by name
   */
  getBundleDefinition(bundleName: string): BundleDefinition | null {
    if (!this.config) {
      throw new Error('Workspace configuration not loaded')
    }

    return this.config.bundles.find(b => b.name === bundleName) || null
  }

  /**
   * Get all bundle definitions
   */
  getAllBundleDefinitions(): BundleDefinition[] {
    if (!this.config) {
      throw new Error('Workspace configuration not loaded')
    }

    return [...this.config.bundles]
  }

  /**
   * Get bundles sorted by priority and dependencies
   */
  getBundlesBuildOrder(): BundleDefinition[] {
    if (!this.config) {
      throw new Error('Workspace configuration not loaded')
    }

    const bundles = [...this.config.bundles]
    const sorted: BundleDefinition[] = []
    const visited = new Set<string>()

    const visit = (bundleName: string) => {
      if (visited.has(bundleName)) {
        return
      }

      const bundle = bundles.find(b => b.name === bundleName)
      if (!bundle) {
        return
      }

      // Visit dependencies first
      for (const dep of bundle.dependencies || []) {
        visit(dep)
      }

      visited.add(bundleName)
      sorted.push(bundle)
    }

    // Sort by priority first, then process
    bundles.sort((a, b) => (a.priority || 0) - (b.priority || 0))

    for (const bundle of bundles) {
      visit(bundle.name)
    }

    return sorted
  }

  /**
   * Convert bundle definition to QuackConfig for single bundle processing
   */
  createBundleConfig(bundleName: string, overrides: Partial<QuackConfig> = {}): QuackConfig {
    if (!this.config) {
      throw new Error('Workspace configuration not loaded')
    }

    const bundle = this.getBundleDefinition(bundleName)
    if (!bundle) {
      throw new Error(`Bundle "${bundleName}" not found in workspace`)
    }

    const bundleConfig: QuackConfig = {
      source: resolve(this.workspaceRoot, bundle.source),
      output: resolve(this.config.output || resolve(this.workspaceRoot, 'dist'), `${bundle.name}.${bundle.format || 'zip'}`),
      format: bundle.format || 'zip',
      compression: {
        level: bundle.compression?.level || 6,
        algorithm: bundle.compression?.algorithm || 'deflate'
      },
      encryption: {
        enabled: bundle.encryption?.enabled || false,
        algorithm: bundle.encryption?.algorithm || 'xor',
        key: bundle.encryption?.key
      },
      versioning: this.config.globalSettings?.versioning,
      plugins: [],
      ignore: [],
      verbose: false,
      ...overrides
    }

    return bundleConfig
  }

  /**
   * Get workspace configuration
   */
  getConfig(): WorkspaceConfig | null {
    return this.config
  }

  /**
   * Get workspace root directory
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot
  }

  /**
   * Create sample workspace configuration
   */
  static createSampleConfig(): WorkspaceConfig {
    return {
      name: 'MyGameAssets',
      version: '1.0.0',
      bundles: [
        {
          name: 'core',
          displayName: 'Core Assets',
          source: './assets/core',
          priority: 0,
          loadTrigger: 'immediate',
          description: 'Essential game assets that must be loaded first',
          dependencies: []
        },
        {
          name: 'ui',
          displayName: 'User Interface',
          source: './assets/ui',
          priority: 1,
          loadTrigger: 'immediate',
          description: 'User interface elements and menus',
          dependencies: ['core']
        },
        {
          name: 'levels',
          displayName: 'Game Levels',
          source: './assets/levels',
          priority: 2,
          loadTrigger: 'lazy',
          description: 'Level-specific assets loaded on demand',
          dependencies: ['core', 'ui']
        },
        {
          name: 'audio',
          displayName: 'Audio Assets',
          source: './assets/audio',
          priority: 3,
          loadTrigger: 'lazy',
          description: 'Music and sound effects',
          dependencies: ['core']
        }
      ],
      globalSettings: {
        compression: {
          level: 6,
          algorithm: 'lzma'
        },
        encryption: {
          enabled: true,
          algorithm: 'xor'
        },
        versioning: {
          incrementVersion: true
        }
      },
      output: './dist'
    }
  }
}