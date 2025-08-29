// Core plugin system
export { PluginAPIRegistry, getPluginRegistry } from './core/registry'
export { PluginDiscovery, getPluginDiscovery, getDiscoveredDecoratorMappings } from './core/plugin-discovery'
export type { PluginAPIFunction, PluginAPIRegistration, DecoratorMapping } from './core/registry'
export type {
  PluginPackageSpec,
  PluginPackageExports,
  PluginInstance,
  CustomPluginRegistry,
  CustomPluginSpec,
  DiscoveredPlugin,
} from './core/plugin-spec'

export { BaseEnginePlugin } from './core/types'
export type { EngineContext, EnginePlugin, PluginConstructor, PluginConstructorOptions } from './core/types'

// Plugin development framework
export { PluginFramework, defineAPIFunction, defineDecorator } from './framework/base'