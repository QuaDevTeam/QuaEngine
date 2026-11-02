import type {
  NativeQssPropertyDefinition,
  NativeUiComponentDefinition,
} from '../model/types'
import { nativeUiComponents } from './components'
import { nativeQssProperties } from './qss'

export const QUA_UI_LANGUAGE_ID = 'qua-ui'
export const QUA_STYLE_LANGUAGE_ID = 'qua-style'
export const QUA_UI_FILE_EXTENSIONS = ['.qui'] as const
export const QUA_STYLE_FILE_EXTENSIONS = ['.qss'] as const

export { nativeUiComponents } from './components'
export { nativeQuiDirectiveNames } from './directives'
export {
  nativeQssProperties,
  nativeQssPseudoStates,
} from './qss'

export function findNativeUiComponent(name: string): NativeUiComponentDefinition | undefined {
  return nativeUiComponents.find(component => component.name === name)
}

export function findNativeQssProperty(name: string): NativeQssPropertyDefinition | undefined {
  return nativeQssProperties.find(property => property.name === name)
}

export function nativeWgpuQssFeatureNames(): string[] {
  return nativeQssProperties
    .filter(property => property.nativeWgpu)
    .map(property => property.name)
}

export function nativeWgpuQuiComponentNames(): string[] {
  return nativeUiComponents
    .filter(component => component.kind === 'base')
    .map(component => component.name)
}
