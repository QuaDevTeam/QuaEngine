import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaStore } from '@quajs/store'
import type { EngineCheckpoint, JumpContext, QuaEngineInterface, RuntimePackageContext, RuntimePackageStoreMigrationManifest, StoryPoint } from '../../core/types'
import type { PluginAPIRegistration } from './registry'
import { getPluginRegistry } from './registry'

/**
 * Plugin interaction interface for accessing other plugins
 */
export interface PluginContext {
  /**
   * Get a plugin instance by name
   */
  getPlugin: <T extends EnginePlugin = EnginePlugin>(name: string) => T | undefined

  /**
   * Get a plugin instance by ID
   */
  getPluginById: <T extends EnginePlugin = EnginePlugin>(id: string) => T | undefined

  /**
   * Get all registered plugins
   */
  getAllPlugins: () => Map<string, EnginePlugin>

  /**
   * Check if a plugin is registered
   */
  hasPlugin: (name: string) => boolean
}

/**
 * Context object passed to engine plugins
 */
export interface EngineContext {
  engine: QuaEngineInterface
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
  stepId?: string
  point?: StoryPoint
  checkpoint?: EngineCheckpoint
  jump?: JumpContext
  runtimePackage?: RuntimePackageContext
  runtimeMigration?: RuntimePackageStoreMigrationManifest
  plugins: PluginContext
}

/**
 * Base interface for all engine plugins
 */
export interface EnginePlugin {
  readonly name: string
  readonly id?: string
  readonly version?: string
  readonly description?: string

  /**
   * Initialize the plugin with the engine context
   */
  init: (ctx: EngineContext) => void | Promise<void>

  /**
   * Called when a game step is executed
   * This is where most logic plugins will do their work
   */
  onStep?: (ctx: EngineContext) => void | Promise<void>

  onStepStart?: (ctx: EngineContext) => void | Promise<void>

  onStepComplete?: (ctx: EngineContext) => void | Promise<void>

  onBeforeCheckpoint?: (ctx: EngineContext) => void | Promise<void>

  onAfterCheckpoint?: (ctx: EngineContext) => void | Promise<void>

  onBeforeJump?: (ctx: EngineContext) => void | Promise<void>

  onAfterJump?: (ctx: EngineContext) => void | Promise<void>

  onRuntimePackageActivate?: (ctx: EngineContext) => void | Promise<void>

  onRuntimePackageUnload?: (ctx: EngineContext) => void | Promise<void>

  onRuntimePackageMigrate?: (ctx: EngineContext) => void | Promise<void>

  /**
   * Called when the engine is destroyed
   */
  destroy?: () => void | Promise<void>

  /**
   * Register plugin APIs and decorators (optional)
   * Called during plugin registration to extend global APIs
   * These APIs will be accessible to other plugins through the global API registry
   */
  registerAPIs?: () => PluginAPIRegistration | Promise<PluginAPIRegistration>
}

/**
 * Plugin constructor options
 */
export type PluginConstructorOptions = Record<string, unknown>

/**
 * Plugin class constructor
 */
export interface PluginConstructor {
  new(options?: PluginConstructorOptions): EnginePlugin
}

/**
 * Base class for engine plugins - minimal and clean
 * Developers have full control over state management and communication
 */
export abstract class BaseEnginePlugin implements EnginePlugin {
  abstract readonly name: string
  readonly id?: string
  readonly version?: string
  readonly description?: string

  protected ctx?: EngineContext
  private _apiRegistered = false

  constructor(protected options: PluginConstructorOptions = {}) { }

  /**
   * Initialize the plugin
   * Stores the context and calls the setup method
   */
  async init(ctx: EngineContext): Promise<void> {
    this.ctx = ctx

    // Register APIs if not already done and plugin provides them
    if (!this._apiRegistered && this.registerAPIs) {
      const registration = await this.registerAPIs()
      getPluginRegistry().registerPlugin(registration)
      this._apiRegistered = true
    }

    await this.setup?.(ctx)
  }

  /**
   * Setup method to be implemented by subclasses
   * Called during initialization
   */
  protected setup?(ctx: EngineContext): void | Promise<void>

  /**
   * Called when a game step is executed
   */
  async onStep?(ctx: EngineContext): Promise<void>

  async onStepStart?(ctx: EngineContext): Promise<void>

  async onStepComplete?(ctx: EngineContext): Promise<void>

  async onBeforeCheckpoint?(ctx: EngineContext): Promise<void>

  async onAfterCheckpoint?(ctx: EngineContext): Promise<void>

  async onBeforeJump?(ctx: EngineContext): Promise<void>

  async onAfterJump?(ctx: EngineContext): Promise<void>

  async onRuntimePackageActivate?(ctx: EngineContext): Promise<void>

  async onRuntimePackageUnload?(ctx: EngineContext): Promise<void>

  async onRuntimePackageMigrate?(ctx: EngineContext): Promise<void>

  /**
   * Register plugin APIs and decorators (optional)
   * Override this method to provide custom APIs and QuaScript decorators
   * These APIs will be accessible to other plugins through the global API registry
   */
  registerAPIs?(): PluginAPIRegistration | Promise<PluginAPIRegistration>

  /**
   * Cleanup method to be implemented by subclasses
   */
  async destroy?(): Promise<void> {
    // Unregister APIs when plugin is destroyed
    if (this._apiRegistered) {
      getPluginRegistry().unregisterPlugin(this.name)
      this._apiRegistered = false
    }
  }

  // No predefined state management or communication helpers
  // Developers access ctx.store, ctx.pipeline, ctx.assets directly for maximum flexibility
  // Full freedom to implement their own patterns and abstractions
}
