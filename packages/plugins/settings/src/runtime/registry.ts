import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type { AnySettingsScopeContribution, SettingsBridge } from '../contracts'

type SettingsRegistryListener = () => void | Promise<void>

export class SettingsScopeRegistry {
  private readonly scopes = new Map<string, AnySettingsScopeContribution>()
  private readonly listeners = new Set<SettingsRegistryListener>()
  private bridge?: SettingsBridge

  registerScope(contribution: AnySettingsScopeContribution): () => void {
    if (!contribution.scope) {
      throw new Error('Settings scope contributions must declare a non-empty scope.')
    }
    if (this.scopes.has(contribution.scope)) {
      throw new Error(`Settings scope "${contribution.scope}" is already registered.`)
    }

    this.scopes.set(contribution.scope, contribution)
    this.notify()

    return () => {
      if (this.scopes.get(contribution.scope) === contribution) {
        this.scopes.delete(contribution.scope)
        this.notify()
      }
    }
  }

  getScopes(): readonly AnySettingsScopeContribution[] {
    return [...this.scopes.values()]
  }

  getScope(scope: string): AnySettingsScopeContribution | undefined {
    return this.scopes.get(scope)
  }

  subscribe(listener: SettingsRegistryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setBridge(bridge: SettingsBridge | undefined): void {
    this.bridge = bridge
  }

  getBridge(): SettingsBridge | undefined {
    return this.bridge
  }

  private notify(): void {
    for (const listener of this.listeners) {
      void listener()
    }
  }
}

const registries = new WeakMap<QuaEngineInterface, SettingsScopeRegistry>()

export function getSettingsScopeRegistry(target: EngineContext | QuaEngineInterface): SettingsScopeRegistry {
  const engine = resolveSettingsEngine(target)
  const existing = registries.get(engine)
  if (existing) {
    return existing
  }

  const registry = new SettingsScopeRegistry()
  registries.set(engine, registry)
  return registry
}

export function registerSettingsScope(
  target: EngineContext | QuaEngineInterface,
  contribution: AnySettingsScopeContribution,
): () => void {
  return getSettingsScopeRegistry(target).registerScope(contribution)
}

export function getSettingsBridge(target: EngineContext | QuaEngineInterface): SettingsBridge | undefined {
  return getSettingsScopeRegistry(target).getBridge()
}

function resolveSettingsEngine(target: EngineContext | QuaEngineInterface): QuaEngineInterface {
  return 'engine' in target ? target.engine : target
}
