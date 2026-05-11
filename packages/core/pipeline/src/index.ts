// Core types for the pipeline system
import { getPackageLogger } from '@quajs/logger'

const logger = getPackageLogger('pipeline')

export const version = '0.1.0'

type MaybePromise<T> = T | Promise<T>

export interface PipelineEvent<T = unknown> {
  type: string
  payload: T
  timestamp: number
  id: string
}

export interface PipelineEventInit {
  timestamp?: number
  id?: string
}

export interface PipelineEventInput<T = unknown> extends PipelineEventInit {
  type: string
  payload: T
}

export interface PipelineContext<T = unknown> {
  event: PipelineEvent<T>
  handled: boolean
  stopPropagation: boolean
}

export type PipelineDelivery<T = unknown> = PipelineEvent<T> | PipelineContext<T>
export type EventListener<T = unknown> = (context: PipelineContext<T>) => void | Promise<void>
export type MiddlewareNext = () => Promise<void> | void
export type MiddlewareFunction<T = unknown> = (
  context: PipelineContext<T>,
  next: MiddlewareNext,
) => Promise<void> | void

export interface PipelineTransportContext {
  readonly pipeline: Pipeline
  createEvent: <T = unknown>(type: string, payload: T, init?: PipelineEventInit) => PipelineEvent<T>
  deliver: <T = unknown>(delivery: PipelineDelivery<T>) => Promise<void>
  receive: <T = unknown>(event: PipelineEventInput<T>) => Promise<void>
  getEventTypes: () => string[]
  getListenerCount: (type: string) => number
}

export interface PipelineTransport {
  readonly name: string
  setup?: (context: PipelineTransportContext) => MaybePromise<void>
  publish: <T = unknown>(context: PipelineContext<T>, transport: PipelineTransportContext) => MaybePromise<void>
  subscribe?: (type: string, context: PipelineTransportContext) => MaybePromise<void>
  unsubscribe?: (type: string, context: PipelineTransportContext) => MaybePromise<void>
  dispose?: (context: PipelineTransportContext) => MaybePromise<void>
}

export interface PipelineOptions {
  middlewares?: (MiddlewareFunction | Middleware)[]
  plugins?: Plugin[]
  transport?: PipelineTransport
}

export class LocalPipelineTransport implements PipelineTransport {
  readonly name = 'local'

  publish<T = unknown>(context: PipelineContext<T>, transport: PipelineTransportContext): Promise<void> {
    return transport.deliver(context)
  }
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

  install(pipeline: Pipeline): void | Promise<void> {
    return this.setup(pipeline)
  }
}

// Main Pipeline class
export class Pipeline {
  private middlewares: MiddlewareFunction[] = []
  private listeners: Map<string, Set<EventListener>> = new Map()
  private plugins: Set<Plugin> = new Set()
  private pluginSetupTasks: Set<Promise<void>> = new Set()
  private activeTransportSubscriptions: Set<string> = new Set()
  private transport: PipelineTransport
  private transportContext: PipelineTransportContext
  private transportReady: Promise<void> = Promise.resolve()
  private transportVersion = 0

  constructor(options: PipelineOptions = {}) {
    this.transportContext = this.createTransportContext()
    this.transport = new LocalPipelineTransport()
    this.setTransport(options.transport ?? this.transport)

    if (options.middlewares) {
      options.middlewares.forEach(middleware => this.addMiddleware(middleware))
    }
    if (options.plugins) {
      options.plugins.forEach(plugin => this.use(plugin))
    }
  }

  setTransport(transport: PipelineTransport): this {
    const previousTransport = this.transport
    const shouldDisposePrevious = previousTransport !== transport
    const version = ++this.transportVersion

    if (shouldDisposePrevious && previousTransport.dispose) {
      void this.runTransportLifecycle(
        previousTransport,
        'dispose',
        () => previousTransport.dispose!(this.transportContext),
      )
    }

    this.transport = transport
    this.activeTransportSubscriptions.clear()
    this.transportReady = this.runTransportLifecycle(
      transport,
      'setup',
      () => transport.setup?.(this.transportContext),
    ).then(async () => {
      if (this.transport !== transport || this.transportVersion !== version) {
        return
      }
      await this.syncTransportSubscriptions(transport, version)
    })

    return this
  }

  getTransport(): PipelineTransport {
    return this.transport
  }

  // Add middleware to the pipeline
  addMiddleware(middleware: MiddlewareFunction | Middleware): this {
    if (middleware instanceof Middleware) {
      const middlewareFunction = middleware.toFunction()
      // Store reference to original middleware for setup
      const middlewareWithRef = middlewareFunction as MiddlewareFunction & { __middleware: Middleware }
      middlewareWithRef.__middleware = middleware
      this.middlewares.push(middlewareWithRef)
      this.setupMiddleware(middleware)
    }
    else {
      this.middlewares.push(middleware)
    }
    return this
  }

  private setupMiddleware(middleware: Middleware): void {
    if (!middleware.setup) {
      return
    }

    try {
      const setupResult = middleware.setup(this)
      if (setupResult instanceof Promise) {
        setupResult.catch((error) => {
          logger.error('Error setting up middleware:', error)
        })
      }
    }
    catch (error) {
      logger.error('Error setting up middleware:', error)
    }
  }

  // Install plugin
  use(plugin: Plugin): this {
    if (this.plugins.has(plugin)) {
      return this
    }

    this.plugins.add(plugin)

    try {
      const setupTask = Promise.resolve(plugin.install(this))
        .catch((error) => {
          logger.error(`Error setting up plugin ${plugin.name}:`, error)
        })
        .finally(() => {
          this.pluginSetupTasks.delete(setupTask)
        })
      this.pluginSetupTasks.add(setupTask)
    }
    catch (error) {
      logger.error(`Error setting up plugin ${plugin.name}:`, error)
    }

    return this
  }

  // Add event listener
  on<T = unknown>(type: string, listener: EventListener<T>): this {
    const previousCount = this.getListenerCount(type)
    this.addLocalListener(type, listener)

    if (previousCount === 0) {
      this.subscribeTransport(type)
    }

    return this
  }

  private addLocalListener<T = unknown>(type: string, listener: EventListener<T>): this {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener as EventListener)
    return this
  }

  // Remove event listener
  off<T = unknown>(type: string, listener: EventListener<T>): this {
    const previousCount = this.getListenerCount(type)
    this.removeLocalListener(type, listener)

    if (previousCount > 0 && this.getListenerCount(type) === 0) {
      this.unsubscribeTransport(type)
    }

    return this
  }

  private removeLocalListener<T = unknown>(type: string, listener: EventListener<T>): this {
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.delete(listener as EventListener)
      if (listeners.size === 0) {
        this.listeners.delete(type)
      }
    }
    return this
  }

  // Emit event through the configured transport
  async emit<T = unknown>(type: string, payload: T): Promise<void> {
    await this.waitForPluginSetups()

    const event = this.createEvent(type, payload)
    const context = this.createContext(event)

    await this.executeMiddlewareChain(context)

    if (context.stopPropagation) {
      return
    }

    await this.waitForTransportReady()
    await this.transport.publish(context, this.transportContext)
  }

  // Inject an externally received event into this pipeline without publishing it again.
  async receive<T = unknown>(event: PipelineEventInput<T>): Promise<void> {
    const normalizedEvent = this.normalizeEvent(event)
    const context = this.createContext(normalizedEvent)

    await this.executeMiddlewareChain(context)

    if (!context.stopPropagation) {
      await this.notifyListeners(context)
    }
  }

  private createTransportContext(): PipelineTransportContext {
    return {
      pipeline: this,
      createEvent: <T = unknown>(type: string, payload: T, init?: PipelineEventInit) =>
        this.createEvent(type, payload, init),
      deliver: <T = unknown>(delivery: PipelineDelivery<T>) => this.deliverEvent(delivery),
      receive: <T = unknown>(event: PipelineEventInput<T>) => this.receive(event),
      getEventTypes: () => this.getEventTypes(),
      getListenerCount: (type: string) => this.getListenerCount(type),
    }
  }

  private createEvent<T = unknown>(
    type: string,
    payload: T,
    init: PipelineEventInit = {},
  ): PipelineEvent<T> {
    return {
      type,
      payload,
      timestamp: init.timestamp ?? Date.now(),
      id: init.id ?? this.generateEventId(),
    }
  }

  private normalizeEvent<T = unknown>(event: PipelineEventInput<T>): PipelineEvent<T> {
    return this.createEvent(event.type, event.payload, event)
  }

  private createContext<T = unknown>(event: PipelineEvent<T>): PipelineContext<T> {
    return {
      event,
      handled: false,
      stopPropagation: false,
    }
  }

  private async deliverEvent<T = unknown>(delivery: PipelineDelivery<T>): Promise<void> {
    await this.notifyListeners(this.normalizeDelivery(delivery))
  }

  private normalizeDelivery<T = unknown>(delivery: PipelineDelivery<T>): PipelineContext<T> {
    if ('event' in delivery) {
      return delivery
    }
    return this.createContext(delivery)
  }

  private async waitForPluginSetups(): Promise<void> {
    if (this.pluginSetupTasks.size === 0) {
      return
    }
    await Promise.all(Array.from(this.pluginSetupTasks))
  }

  private async waitForTransportReady(): Promise<void> {
    await this.transportReady
  }

  private subscribeTransport(type: string): void {
    if (this.activeTransportSubscriptions.has(type)) {
      return
    }

    this.activeTransportSubscriptions.add(type)
    const transport = this.transport
    const version = this.transportVersion

    void this.transportReady
      .then(async () => {
        if (
          this.transport !== transport
          || this.transportVersion !== version
          || !this.activeTransportSubscriptions.has(type)
          || this.getListenerCount(type) === 0
        ) {
          return
        }

        await this.runTransportLifecycle(
          transport,
          `subscribe:${type}`,
          () => transport.subscribe?.(type, this.transportContext),
        )
      })
      .catch((error) => {
        logger.error(`Error subscribing transport ${transport.name} to ${type}:`, error)
      })
  }

  private unsubscribeTransport(type: string): void {
    if (!this.activeTransportSubscriptions.has(type)) {
      return
    }

    this.activeTransportSubscriptions.delete(type)
    const transport = this.transport
    const version = this.transportVersion

    void this.transportReady
      .then(async () => {
        if (
          this.transport !== transport
          || this.transportVersion !== version
          || this.activeTransportSubscriptions.has(type)
          || this.getListenerCount(type) > 0
        ) {
          return
        }

        await this.runTransportLifecycle(
          transport,
          `unsubscribe:${type}`,
          () => transport.unsubscribe?.(type, this.transportContext),
        )
      })
      .catch((error) => {
        logger.error(`Error unsubscribing transport ${transport.name} from ${type}:`, error)
      })
  }

  private async syncTransportSubscriptions(
    transport: PipelineTransport,
    version: number,
  ): Promise<void> {
    for (const type of this.getEventTypes()) {
      if (this.transport !== transport || this.transportVersion !== version) {
        return
      }
      this.subscribeTransport(type)
    }
  }

  private async runTransportLifecycle(
    transport: PipelineTransport,
    operation: string,
    action: () => MaybePromise<void>,
  ): Promise<void> {
    try {
      await action()
    }
    catch (error) {
      logger.error(`Error during transport ${transport.name} ${operation}:`, error)
    }
  }

  // Execute middleware chain in onion model
  private async executeMiddlewareChain<T>(
    context: PipelineContext<T>,
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
      await middleware(context, () => dispatch(i + 1))
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
          this.safeExecuteListener(listener, context),
        ),
      )
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*')
    if (wildcardListeners) {
      await Promise.all(
        Array.from(wildcardListeners).map(listener =>
          this.safeExecuteListener(listener, context),
        ),
      )
    }
  }

  // Safely execute listener with error handling
  private async safeExecuteListener<T>(
    listener: EventListener<T>,
    context: PipelineContext<T>,
  ): Promise<void> {
    try {
      await listener(context)
    }
    catch (error) {
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
      const hadListeners = this.getListenerCount(type) > 0
      this.listeners.delete(type)
      if (hadListeners) {
        this.unsubscribeTransport(type)
      }
    }
    else {
      const types = this.getEventTypes()
      this.listeners.clear()
      types.forEach(eventType => this.unsubscribeTransport(eventType))
    }
    return this
  }

  // Clear all middlewares
  clearMiddlewares(): this {
    this.middlewares.length = 0
    return this
  }
}
