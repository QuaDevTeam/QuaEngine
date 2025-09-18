import type { FSWatcher } from 'vite'
import type { DecoratorMapping } from '../core/types'
import process from 'node:process'

/**
 * Hot-reload event types
 */
export interface HotReloadEvent {
  type: 'quascript-change' | 'plugin-change' | 'config-change'
  file: string
  timestamp: number
  content?: string
}

/**
 * Hot-reload callback function
 */
export type HotReloadCallback = (event: HotReloadEvent) => void | Promise<void>

/**
 * Cache entry for compiled QuaScript
 */
interface CacheEntry {
  source: string
  compiled: string
  dependencies: Set<string>
  timestamp: number
  decoratorMappings: DecoratorMapping
}

/**
 * Hot-reload manager for QuaScript compiler
 * Handles file watching, caching, and incremental compilation
 */
export class HotReloadManager {
  private watchers = new Map<string, FSWatcher>()
  private cache = new Map<string, CacheEntry>()
  private callbacks = new Set<HotReloadCallback>()
  private decoratorMappings: DecoratorMapping = {}
  private isEnabled = false

  constructor(private readonly _projectRoot: string = process.cwd()) {}

  /**
   * Enable hot-reload functionality
   */
  enable(): void {
    this.isEnabled = true
  }

  /**
   * Disable hot-reload functionality
   */
  disable(): void {
    this.isEnabled = false
    this.stopWatching()
  }

  /**
   * Check if hot-reload is enabled
   */
  isHotReloadEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * Add a hot-reload callback
   */
  onHotReload(callback: HotReloadCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  /**
   * Update decorator mappings (from plugin system)
   */
  updateDecoratorMappings(mappings: DecoratorMapping): void {
    const changed = JSON.stringify(this.decoratorMappings) !== JSON.stringify(mappings)
    this.decoratorMappings = mappings

    if (changed && this.isEnabled) {
      this.invalidateAllCache()
      this.notifyCallbacks({
        type: 'config-change',
        file: 'decorator-mappings',
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Get cached compilation result
   */
  getCached(filePath: string, source: string): string | null {
    if (!this.isEnabled) {
      return null
    }

    const entry = this.cache.get(filePath)
    if (!entry) {
      return null
    }

    // Check if source has changed
    if (entry.source !== source) {
      this.cache.delete(filePath)
      return null
    }

    // Check if decorator mappings have changed
    if (JSON.stringify(entry.decoratorMappings) !== JSON.stringify(this.decoratorMappings)) {
      this.cache.delete(filePath)
      return null
    }

    return entry.compiled
  }

  /**
   * Set cached compilation result
   */
  setCached(filePath: string, source: string, compiled: string, dependencies: string[] = []): void {
    if (!this.isEnabled) {
      return
    }

    this.cache.set(filePath, {
      source,
      compiled,
      dependencies: new Set(dependencies),
      timestamp: Date.now(),
      decoratorMappings: { ...this.decoratorMappings },
    })
  }

  /**
   * Watch a file for changes
   */
  watchFile(filePath: string, watcher?: FSWatcher): void {
    if (!this.isEnabled || this.watchers.has(filePath)) {
      return
    }

    if (watcher) {
      this.watchers.set(filePath, watcher)
    }
  }

  /**
   * Stop watching a file
   */
  unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(filePath)
    }
  }

  /**
   * Stop watching all files
   */
  stopWatching(): void {
    for (const [, watcher] of this.watchers) {
      watcher.close()
    }
    this.watchers.clear()
  }

  /**
   * Handle file change event
   */
  handleFileChange(filePath: string, content?: string): void {
    if (!this.isEnabled) {
      return
    }

    // Invalidate cache for the changed file
    this.invalidateFile(filePath)

    // Determine event type based on file path
    let eventType: HotReloadEvent['type'] = 'quascript-change'

    if (filePath.includes('qua.plugins.json') || filePath.includes('package.json')) {
      eventType = 'config-change'
    }
    else if (filePath.includes('plugin') || filePath.endsWith('.plugin.js') || filePath.endsWith('.plugin.ts')) {
      eventType = 'plugin-change'
    }

    this.notifyCallbacks({
      type: eventType,
      file: filePath,
      timestamp: Date.now(),
      content,
    })
  }

  /**
   * Invalidate cache for a specific file and its dependents
   */
  invalidateFile(filePath: string): void {
    // Remove the file itself
    this.cache.delete(filePath)

    // Remove any files that depend on this file
    for (const [cachedPath, entry] of this.cache) {
      if (entry.dependencies.has(filePath)) {
        this.cache.delete(cachedPath)
      }
    }
  }

  /**
   * Invalidate all cached entries
   */
  invalidateAllCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number
    entries: Array<{
      file: string
      timestamp: number
      dependencies: string[]
    }>
  } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([file, entry]) => ({
        file,
        timestamp: entry.timestamp,
        dependencies: Array.from(entry.dependencies),
      })),
    }
  }

  /**
   * Notify all callbacks about a hot-reload event
   */
  private notifyCallbacks(event: HotReloadEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event)
      }
      catch (error) {
        console.error('Hot-reload callback error:', error)
      }
    }
  }
}

/**
 * Global hot-reload manager instance
 */
let globalHotReloadManager: HotReloadManager | null = null

/**
 * Get or create the global hot-reload manager
 */
export function getHotReloadManager(projectRoot?: string): HotReloadManager {
  if (!globalHotReloadManager) {
    globalHotReloadManager = new HotReloadManager(projectRoot)
  }
  return globalHotReloadManager
}

/**
 * Reset the global hot-reload manager (for testing)
 */
export function resetHotReloadManager(): void {
  if (globalHotReloadManager) {
    globalHotReloadManager.disable()
  }
  globalHotReloadManager = null
}
