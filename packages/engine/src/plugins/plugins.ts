import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaStore } from '@quajs/store'
import type { QuaEngineInterface } from '../core/types'

/**
 * Context object passed to engine plugins
 */
export interface EngineContext {
  engine: QuaEngineInterface
  store: QuaStore
  assets: QuaAssets
  pipeline: Pipeline
  stepId?: string
}

/**
 * Base interface for all engine plugins
 */
export interface EnginePlugin {
  readonly name: string
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

  /**
   * Called when the engine is destroyed
   */
  destroy?: () => void | Promise<void>
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
 * Abstract base class for engine plugins
 * Provides common functionality and ensures proper typing
 */
export abstract class BaseEnginePlugin implements EnginePlugin {
  abstract readonly name: string
  readonly version?: string
  readonly description?: string

  protected ctx?: EngineContext

  constructor(protected options: PluginConstructorOptions = {}) { }

  /**
   * Initialize the plugin
   * Stores the context and calls the setup method
   */
  async init(ctx: EngineContext): Promise<void> {
    this.ctx = ctx
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

  /**
   * Cleanup method to be implemented by subclasses
   */
  async destroy?(): Promise<void>

  /**
   * Get the engine context (throws if not initialized)
   */
  protected getContext(): EngineContext {
    if (!this.ctx) {
      throw new Error(`Plugin ${this.name} not initialized`)
    }
    return this.ctx
  }

  /**
   * Emit an event to the render layer
   */
  protected emit(event: string, payload?: unknown): Promise<void> {
    return this.getContext().pipeline.emit(event, payload)
  }

  /**
   * Get the current store state
   */
  protected getState(): Record<string, unknown> {
    return (this.getContext().store as { state: Record<string, unknown> }).state
  }

  /**
   * Dispatch a mutation to the store
   */
  protected dispatch(mutation: string, payload?: unknown): void {
    (this.getContext().store as { commit: (mutation: string, payload?: unknown) => void }).commit(mutation, payload)
  }

  /**
   * Load an asset
   */
  protected async loadAsset(name: string): Promise<unknown> {
    return (this.getContext().assets as unknown as { get: (name: string) => Promise<unknown> }).get(name)
  }
}
