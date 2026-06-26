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
  assertQuackPluginReferencesTargetIsolation(plugins.map(plugin => plugin.name), {
    ...options,
    fieldName: options.fieldName || 'QuackConfig.plugins',
  })
}

export function targetFromAssetPlatform(platform: unknown): QuaTargetBootstrap | undefined {
  return platform === 'web' || platform === 'cocos' || platform === 'native'
    ? platform
    : undefined
}
