// Core types for the pipeline system
import { getPackageLogger } from '@quajs/logger'

const logger = getPackageLogger('pipeline')

export interface PipelineEvent<T = unknown> {
  type: string
  payload: T
  timestamp: number
  id: string
}

export interface PipelineContext<T = unknown> {
  event: PipelineEvent<T>
  handled: boolean
  stopPropagation: boolean
}

export type EventListener<T = unknown> = (context: PipelineContext<T>) => void | Promise<void>
export type MiddlewareNext = () => Promise<void> | void
export type MiddlewareFunction<T = unknown> = (
  context: PipelineContext<T>,
  next: MiddlewareNext
) => Promise<void> | void

// Plugin hook types for taking over event transport
export interface PluginEmitHook {
  (type: string, payload: unknown, originalEmit: (type: string, payload: unknown) => Promise<void>): Promise<void>
}

export interface PluginOnHook {
  (type: string, listener: EventListener, originalOn: (type: string, listener: EventListener) => unknown): unknown
}

export interface PluginOffHook {
  (type: string, listener: EventListener, originalOff: (type: string, listener: EventListener) => unknown): unknown
}

export interface PipelinePlugin {
  name: string
  install(pipeline: Pipeline): void
}

export interface PipelineOptions {
  middlewares?: (MiddlewareFunction | Middleware)[]
  plugins?: (PipelinePlugin | Plugin)[]
}

// Abstract middleware base class
export abstract class Middleware<T = unknown> {
  protected eventTypes: string[] | null = null

  constructor(eventTypes?: string[]) {
    if (eventTypes) {
      this.eventTypes = eventTypes
    }
  }

  // Setup method for initialization
  setup?(pipeline: Pipeline): void | Promise<void>

  // Check if this middleware should handle the event
  protected shouldHandle(eventType: string): boolean {
    return this.eventTypes === null || this.eventTypes.includes(eventType)
  }

  // Abstract method that must be implemented by subclasses
  abstract handle(
    context: PipelineContext<T>,
    next: MiddlewareNext
  ): Promise<void> | void

  // Convert to middleware function
  toFunction(): MiddlewareFunction<T> {
    return (context: PipelineContext<T>, next: MiddlewareNext) => {
      if (!this.shouldHandle(context.event.type)) {
        return next()
      }
      return this.handle(context, next)
    }
  }
}

// Abstract plugin base class
export abstract class Plugin {
  abstract readonly name: string

  // Setup method for plugin initialization
  abstract setup(pipeline: Pipeline): void | Promise<void>

  // Optional hook to take over emit functionality
  protected emitHook?: PluginEmitHook

  // Optional hook to take over on functionality  
  protected onHook?: PluginOnHook

  // Optional hook to take over off functionality
  protected offHook?: PluginOffHook

  // Install method that calls setup and registers hooks
  install(pipeline: Pipeline): void {
    // Setup can be async, but install is sync for interface compatibility
    const setupResult = this.setup(pipeline)
    if (setupResult instanceof Promise) {
      setupResult.catch((error) => {
        logger.error(`Error setting up plugin ${this.name}:`, error)
      })
    }
    
    if (this.emitHook) {
      pipeline.setEmitHook(this.emitHook)
    }
    
    if (this.onHook) {
      pipeline.setOnHook(this.onHook)
    }
    
    if (this.offHook) {
      pipeline.setOffHook(this.offHook)
    }
  }

  // Helper method to set emit hook from subclasses
  protected setEmitHook(hook: PluginEmitHook): void {
    this.emitHook = hook
  }

  // Helper method to set on hook from subclasses
  protected setOnHook(hook: PluginOnHook): void {
    this.onHook = hook
  }

  // Helper method to set off hook from subclasses
  protected setOffHook(hook: PluginOffHook): void {
    this.offHook = hook
  }
}

// Main Pipeline class
export class Pipeline {
  private middlewares: MiddlewareFunction[] = []
  private listeners: Map<string, Set<EventListener>> = new Map()
  private plugins: Set<PipelinePlugin | Plugin> = new Set()
  
  // Plugin hooks for taking over event transport
  private emitHook?: PluginEmitHook
  private onHook?: PluginOnHook
  private offHook?: PluginOffHook

  constructor(options: PipelineOptions = {}) {
    // Initialize middlewares and plugins
    if (options.middlewares) {
      options.middlewares.forEach(middleware => this.addMiddleware(middleware))
    }
    if (options.plugins) {
      options.plugins.forEach(plugin => this.use(plugin))
    }
    
    // Call setup methods after all plugins and middlewares are added
    // Note: This is fire-and-forget for async setup methods
    void this.initializeComponents()
  }

  // Initialize all components (call setup methods)
  private async initializeComponents(): Promise<void> {
    // Setup middlewares
    for (const middleware of this.middlewares) {
      const middlewareWithRef = middleware as MiddlewareFunction & { __middleware?: Middleware }
      if (middlewareWithRef.__middleware?.setup) {
        try {
          await middlewareWithRef.__middleware.setup(this)
        } catch (error) {
          logger.error('Error setting up middleware:', error)
        }
      }
    }
  }

  // Set plugin hooks
  setEmitHook(hook: PluginEmitHook): void {
    this.emitHook = hook
  }

  setOnHook(hook: PluginOnHook): void {
    this.onHook = hook
  }

  setOffHook(hook: PluginOffHook): void {
    this.offHook = hook
  }

  // Add middleware to the pipeline
  addMiddleware(middleware: MiddlewareFunction | Middleware): this {
    if (middleware instanceof Middleware) {
      const middlewareFunction = middleware.toFunction()
      // Store reference to original middleware for setup
      const middlewareWithRef = middlewareFunction as MiddlewareFunction & { __middleware: Middleware }
      middlewareWithRef.__middleware = middleware
      this.middlewares.push(middlewareWithRef)
    } else {
      this.middlewares.push(middleware)
    }
    return this
  }

  // Install plugin
  use(plugin: PipelinePlugin | Plugin): this {
    if (this.plugins.has(plugin)) {
      return this
    }
    this.plugins.add(plugin)
    plugin.install(this)
    return this
  }

  // Add event listener
  on<T = unknown>(type: string, listener: EventListener<T>): this {
    // Use plugin hook if available
    if (this.onHook) {
      return this.onHook(type, listener as EventListener, this.originalOn.bind(this)) as this
    }
    return this.originalOn(type, listener)
  }

  // Original on method (used internally and by plugins)
  private originalOn<T = unknown>(type: string, listener: EventListener<T>): this {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener as EventListener)
    return this
  }

  // Remove event listener
  off<T = unknown>(type: string, listener: EventListener<T>): this {
    // Use plugin hook if available
    if (this.offHook) {
      return this.offHook(type, listener as EventListener, this.originalOff.bind(this)) as this
    }
    return this.originalOff(type, listener)
  }

  // Original off method (used internally and by plugins)
  private originalOff<T = unknown>(type: string, listener: EventListener<T>): this {
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.delete(listener as EventListener)
      if (listeners.size === 0) {
        this.listeners.delete(type)
      }
    }
    return this
  }

  // Add event listener (alias for on)
  onEvent<T = unknown>(listener: EventListener<T>): this {
    return this.on('*', listener)
  }

  // Emit event through the pipeline
  async emit<T = unknown>(type: string, payload: T): Promise<void> {
    // Use plugin hook if available
    if (this.emitHook) {
      await this.emitHook(type, payload, this.originalEmit.bind(this))
      return
    }
    await this.originalEmit(type, payload)
  }

  // Original emit method (used internally and by plugins)
  private async originalEmit<T = unknown>(type: string, payload: T): Promise<void> {
    const event: PipelineEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
      id: this.generateEventId()
    }

    const context: PipelineContext<T> = {
      event,
      handled: false,
      stopPropagation: false
    }

    // Execute middleware chain using Koa-style onion model
    await this.executeMiddlewareChain(context)

    // If not stopped by middleware, notify listeners
    if (!context.stopPropagation) {
      await this.notifyListeners(context)
    }
  }

  // Execute middleware chain in onion model
  private async executeMiddlewareChain<T>(
    context: PipelineContext<T>
  ): Promise<void> {
    let index = -1

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      if (i === this.middlewares.length) {
        return
      }

      const middleware = this.middlewares[i]
      try {
        await middleware(context, () => dispatch(i + 1))
      } catch (error) {
        throw error
      }
    }

    await dispatch(0)
  }

  // Notify all listeners for the event
  private async notifyListeners<T>(context: PipelineContext<T>): Promise<void> {
    const { type } = context.event
    
    // Notify specific event listeners
    const specificListeners = this.listeners.get(type)
    if (specificListeners) {
      await Promise.all(
        Array.from(specificListeners).map(listener =>
          this.safeExecuteListener(listener, context)
        )
      )
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*')
    if (wildcardListeners) {
      await Promise.all(
        Array.from(wildcardListeners).map(listener =>
          this.safeExecuteListener(listener, context)
        )
      )
    }
  }

  // Safely execute listener with error handling
  private async safeExecuteListener<T>(
    listener: EventListener<T>,
    context: PipelineContext<T>
  ): Promise<void> {
    try {
      await listener(context)
    } catch (error) {
      logger.error('Error in pipeline listener:', error)
    }
  }

  // Generate unique event ID
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  // Get all registered event types
  getEventTypes(): string[] {
    return Array.from(this.listeners.keys())
  }

  // Get listener count for a specific event type
  getListenerCount(type: string): number {
    const listeners = this.listeners.get(type)
    return listeners ? listeners.size : 0
  }

  // Remove all listeners
  removeAllListeners(type?: string): this {
    if (type) {
      this.listeners.delete(type)
    } else {
      this.listeners.clear()
    }
    return this
  }

  // Clear all middlewares
  clearMiddlewares(): this {
    this.middlewares.length = 0
    return this
  }
}
