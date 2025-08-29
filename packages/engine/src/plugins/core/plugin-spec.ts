/**
 * QuaJS Plugin Specification v1.0
 *
 * This defines the standard specification for QuaJS plugins
 */

/**
 * Plugin package.json specification
 * Plugin packages should include these fields in their package.json
 */
export interface PluginPackageSpec {
  /** Package name - should follow pattern @quajs/plugin-* or quajs-plugin- */
  name: string
  /** Package version */
  version: string
  /** Package description */
  description?: string
  /** Package main entry */
  main?: string
  /** Package author */
  author?: string | { name: string, email?: string }
  /** Plugin metadata */
  quajs?: {
    /** Plugin type identifier */
    type: 'plugin'
    /** Plugin category for organization */
    category?: 'ui' | 'audio' | 'data' | 'integration' | 'system' | string
    /** Plugin description */
    description?: string
    /** Engine compatibility */
    engineVersion?: string
    /** Plugin entry point (defaults to main field) */
    entry?: string
    /** Plugin decorators provided */
    decorators?: Record<string, {
      function: string
      module: string
      description?: string
      transform?: string // Name of transform function
    }>
    /** Plugin APIs provided */
    apis?: string[]
  }
}

/**
 * Plugin entry point interface
 * Every plugin package should export this structure
 */
export interface PluginPackageExports {
  /** Plugin metadata */
  readonly metadata: {
    name: string
    version: string
    description?: string
    author?: string
    category?: string
  }

  /** Decorator mappings provided by this plugin */
  readonly decorators: Record<string, {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  }>

  /** API functions provided by this plugin */
  readonly apis: Record<string, {
    name: string
    fn: (...args: any[]) => any
    module: string
  }>

  /** Plugin class constructor */
  readonly Plugin: new (options?: any) => PluginInstance
}

/**
 * Plugin instance interface
 */
export interface PluginInstance {
  readonly name: string
  init?: (context: any) => Promise<void> | void
  destroy?: () => Promise<void> | void
  onStep?: (context: any) => Promise<void> | void
}

/**
 * Custom plugin registry file specification
 * Users can define plugins in qua.plugins.json
 */
export interface CustomPluginRegistry {
  /** Registry version */
  version: '1.0'
  /** List of custom plugins */
  plugins: CustomPluginSpec[]
}

/**
 * Custom plugin specification for non-package plugins
 */
export interface CustomPluginSpec {
  /** Plugin name */
  name: string
  /** Plugin entry path (relative to project root) */
  entry: string
  /** Plugin version */
  version?: string
  /** Plugin description */
  description?: string
  /** Plugin category */
  category?: string
  /** Whether plugin is enabled */
  enabled?: boolean
  /** Plugin decorators */
  decorators?: Record<string, {
    function: string
    module: string
    transform?: string
  }>
  /** Plugin APIs */
  apis?: string[]
}

/**
 * Discovered plugin information
 */
export interface DiscoveredPlugin {
  /** Plugin source type */
  source: 'package' | 'custom'
  /** Plugin name */
  name: string
  /** Plugin version */
  version: string
  /** Entry path */
  entry: string
  /** Plugin metadata */
  metadata: {
    description?: string
    category?: string
    author?: string
  }
  /** Decorators provided */
  decorators: Record<string, {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  }>
  /** APIs provided */
  apis: string[]
  /** Whether plugin is enabled */
  enabled: boolean
}
