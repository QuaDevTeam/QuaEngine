// Core plugin system
export { PluginAPIRegistry, getPluginRegistry } from './core/registry'
export type { PluginAPIFunction, PluginAPIRegistration, DecoratorMapping } from './core/registry'

export { BaseEnginePlugin } from './core/types'
export type { EngineContext, EnginePlugin, PluginConstructor, PluginConstructorOptions } from './core/types'

// Plugin development framework
export { PluginFramework, defineAPIFunction, defineDecorator } from './framework/base'

// Example plugins
export { AchievementPlugin } from './examples/achievement'