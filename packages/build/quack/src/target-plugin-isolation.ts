import type {
  OrdinaryPluginReference,
  QuaTargetBootstrap,
  ValidateOrdinaryPluginListTargetIsolationOptions,
} from '@quajs/native-contracts'
import type { QuackPlugin } from './core/types'
import { validateOrdinaryPluginListTargetIsolation } from '@quajs/native-contracts'

export type AssertQuackPluginTargetIsolationOptions = ValidateOrdinaryPluginListTargetIsolationOptions
export type QuackPluginReference = OrdinaryPluginReference

export function assertQuackPluginReferencesTargetIsolation(
  references: readonly QuackPluginReference[],
  options: AssertQuackPluginTargetIsolationOptions = {},
): void {
  const result = validateOrdinaryPluginListTargetIsolation(references, {
    ...options,
    fieldName: options.fieldName || 'Quack plugins',
  })

  if (result.ok)
    return

  throw new Error([
    `Quack plugin list "${options.fieldName || 'Quack plugins'}" must not include Web, Cocos, or native target core adapters.`,
    ...result.diagnostics.map(diagnostic =>
      `- ${diagnostic.specifier} resolves to ${diagnostic.packageName} (${diagnostic.corePluginFamily}).`,
    ),
    'Select target bootstrap through the active target-core resolver before resolving ordinary plugins.',
  ].join('\n'))
}

export const assertQuackPluginSpecifiersTargetIsolation = assertQuackPluginReferencesTargetIsolation

export function assertLoadedQuackPluginTargetIsolation(
  plugins: readonly Pick<QuackPlugin, 'name'>[],
  options: AssertQuackPluginTargetIsolationOptions = {},
): void {
  assertQuackPluginReferencesTargetIsolation(plugins.flatMap(loadedQuackPluginReferences), {
    ...options,
    fieldName: options.fieldName || 'QuackConfig.plugins',
  })
}

export function targetFromAssetPlatform(platform: unknown): QuaTargetBootstrap | undefined {
  return platform === 'web' || platform === 'cocos' || platform === 'native'
    ? platform
    : undefined
}

function loadedQuackPluginReferences(plugin: Pick<QuackPlugin, 'name'>): QuackPluginReference[] {
  const references: QuackPluginReference[] = [plugin.name]
  const specifier = optionalPluginStringMetadata(plugin, 'specifier')
  const packageName = optionalPluginStringMetadata(plugin, 'packageName')
  if (specifier || packageName) {
    references.push({
      specifier,
      packageName,
    })
  }
  return references
}

function optionalPluginStringMetadata(
  plugin: Pick<QuackPlugin, 'name'>,
  key: 'specifier' | 'packageName',
): string | undefined {
  const value = (plugin as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
