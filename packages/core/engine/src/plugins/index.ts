export { PluginContextImpl } from './core/context'
export { getDiscoveredDecoratorMappings, getPluginDiscovery, PluginDiscovery } from './core/plugin-discovery'
export type {
  CustomPluginRegistry,
  CustomPluginSpec,
  DiscoveredPlugin,
  PluginInstance,
  PluginPackageExports,
  PluginPackageSpec,
} from './core/plugin-spec'
// Core plugin system
export { getPluginRegistry, PluginAPIRegistry } from './core/registry'
export type { DecoratorMapping, PluginAPIFunction, PluginAPIRegistration } from './core/registry'

export { BaseEnginePlugin } from './core/types'
export type { EngineContext, EnginePlugin, PluginConstructor, PluginConstructorOptions, PluginContext } from './core/types'

// Plugin development framework
export { defineAPIFunction, defineDecorator, PluginFramework } from './framework/base'
