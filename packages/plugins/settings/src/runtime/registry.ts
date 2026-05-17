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

    const registered = { ...contribution }
    this.scopes.set(contribution.scope, registered)
    this.notify()

    return () => {
      if (this.scopes.get(contribution.scope) === registered) {
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

  unregisterPackageScopes(packageId: string): string[] {
    const removed: string[] = []
    for (const [scope, contribution] of this.scopes.entries()) {
      if (contribution.packageId === packageId) {
        this.scopes.delete(scope)
        removed.push(scope)
      }
    }
    if (removed.length > 0) {
      this.notify()
    }
    return removed
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

const registries = new WeakMap<object, SettingsScopeRegistry>()

export function getSettingsScopeRegistry(target: EngineContext | QuaEngineInterface): SettingsScopeRegistry {
  const engine = resolveSettingsEngine(target)
  const key = settingsRegistryKey(engine)
  const existing = registries.get(key)
  if (existing) {
    return existing
  }

  const registry = new SettingsScopeRegistry()
  registries.set(key, registry)
  return registry
}

export function registerSettingsScope(
  target: EngineContext | QuaEngineInterface,
  contribution: AnySettingsScopeContribution,
): () => void {
  const engine = resolveSettingsEngine(target)
  return getSettingsScopeRegistry(engine).registerScope(withCurrentRuntimeSettingsPackage(engine, contribution))
}

export function getSettingsBridge(target: EngineContext | QuaEngineInterface): SettingsBridge | undefined {
  return getSettingsScopeRegistry(target).getBridge()
}

function resolveSettingsEngine(target: EngineContext | QuaEngineInterface): QuaEngineInterface {
  return 'engine' in target ? target.engine : target
}

function settingsRegistryKey(engine: QuaEngineInterface): object {
  return engine.getStore()
}

function withCurrentRuntimeSettingsPackage(
  engine: QuaEngineInterface,
  contribution: AnySettingsScopeContribution,
): AnySettingsScopeContribution {
  if (contribution.packageId) {
    return contribution
  }
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return contribution
  }
  return {
    ...contribution,
    packageId,
  }
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}
