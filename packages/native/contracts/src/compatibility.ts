import type { QuaNativeHostInfo, RendererTargetCapability } from './capabilities'
import { isCapabilityCompatible } from './capabilities'
import {
  hasCapabilityFieldValue,
  hasCompatibleCapability,
  normalizeNativeRendererCompatibility,
  satisfiesNativeRendererVersionRange,
  uniqueStrings,
} from './compatibility-helpers'

export type NativeCompatibilitySeverity = 'warning' | 'error'

export interface RuntimePackageNativeRendererCompatibility {
  packageName?: '@quajs/native-renderer'
  renderer?: '@quajs/native-renderer'
  rendererPackage?: '@quajs/native-renderer'
  versionRange?: string
  version?: string
  rendererVersion?: string
  capabilities?: readonly string[]
  capabilityIds?: readonly string[]
  optionalCapabilities?: readonly string[]
  optionalCapabilityIds?: readonly string[]
  assetKinds?: readonly string[]
  optionalAssetKinds?: readonly string[]
  intentEvents?: readonly string[]
  optionalIntentEvents?: readonly string[]
  quiComponents?: readonly string[]
  optionalQuiComponents?: readonly string[]
  qssFeatures?: readonly string[]
  optionalQssFeatures?: readonly string[]
  nativeCode?: false
}

export interface NativeCompatibilityDiagnostic {
  code:
    | 'NATIVE_RENDERER_VERSION_MISMATCH'
    | 'NATIVE_REQUIRED_CAPABILITY_MISSING'
    | 'NATIVE_OPTIONAL_CAPABILITY_MISSING'
    | 'NATIVE_CODE_NOT_ALLOWED'
    | 'NATIVE_RENDERER_PACKAGE_MISMATCH'
    | 'NATIVE_REQUIRED_ASSET_KIND_MISSING'
    | 'NATIVE_OPTIONAL_ASSET_KIND_MISSING'
    | 'NATIVE_REQUIRED_INTENT_EVENT_MISSING'
    | 'NATIVE_OPTIONAL_INTENT_EVENT_MISSING'
    | 'NATIVE_REQUIRED_QSS_FEATURE_MISSING'
    | 'NATIVE_OPTIONAL_QSS_FEATURE_MISSING'
    | 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING'
    | 'NATIVE_OPTIONAL_QUI_COMPONENT_MISSING'
  severity: NativeCompatibilitySeverity
  message: string
  pluginId?: string
  required?: string
  actual?: string
}

export interface NativeCompatibilityResult {
  ok: boolean
  diagnostics: NativeCompatibilityDiagnostic[]
}

export interface CheckNativeCompatibilityOptions {
  pluginId?: string
  hostInfo: QuaNativeHostInfo
  compatibility?: RuntimePackageNativeRendererCompatibility
}

export interface CreateNativeUiSurfaceCompatibilityOptions {
  rendererVersionRange?: string
  capabilities?: readonly RendererTargetCapability[]
  extraCapabilities?: readonly string[]
  optionalCapabilities?: readonly string[]
  quiComponents?: readonly string[]
  optionalQuiComponents?: readonly string[]
  intentEvents?: readonly string[]
  optionalIntentEvents?: readonly string[]
  qssFeatures?: readonly string[]
  optionalQssFeatures?: readonly string[]
  assetKinds?: readonly string[]
  optionalAssetKinds?: readonly string[]
}

const NATIVE_RENDERER_PACKAGE = '@quajs/native-renderer'
const NATIVE_WGPU_UI_SURFACE_CAPABILITY = 'native-wgpu.ui.surface@1'
const NATIVE_UI_SURFACE_DECLARATIVE_ASSET_KINDS = ['qui', 'qss', 'tokens'] as const

export function createNativeUiSurfaceCompatibility(
  options: CreateNativeUiSurfaceCompatibilityOptions = {},
): RuntimePackageNativeRendererCompatibility {
  const uiSurfaceCapability = options.capabilities
    ?.find(capability => isCapabilityCompatible(NATIVE_WGPU_UI_SURFACE_CAPABILITY, capability.id))
  const capabilityIds = uniqueStrings([
    NATIVE_WGPU_UI_SURFACE_CAPABILITY,
    ...(options.extraCapabilities || []),
  ])
  const intentEvents = uniqueStrings([
    ...(uiSurfaceCapability?.intentEvents || []),
    ...(options.intentEvents || []),
  ])

  return {
    packageName: NATIVE_RENDERER_PACKAGE,
    ...(options.rendererVersionRange ? { versionRange: options.rendererVersionRange } : {}),
    capabilities: capabilityIds,
    ...(options.optionalCapabilities?.length
      ? { optionalCapabilities: uniqueStrings(options.optionalCapabilities) }
      : {}),
    assetKinds: uniqueStrings([
      ...NATIVE_UI_SURFACE_DECLARATIVE_ASSET_KINDS,
      ...(uiSurfaceCapability?.assetKinds || []),
      ...(options.assetKinds || []),
    ]),
    ...(options.optionalAssetKinds?.length
      ? { optionalAssetKinds: uniqueStrings(options.optionalAssetKinds) }
      : {}),
    ...(intentEvents.length ? { intentEvents } : {}),
    ...(options.optionalIntentEvents?.length
      ? { optionalIntentEvents: uniqueStrings(options.optionalIntentEvents) }
      : {}),
    quiComponents: uniqueStrings([
      ...(uiSurfaceCapability?.quiComponents || []),
      ...(options.quiComponents || []),
    ]),
    ...(options.optionalQuiComponents?.length
      ? { optionalQuiComponents: uniqueStrings(options.optionalQuiComponents) }
      : {}),
    qssFeatures: uniqueStrings([
      ...(uiSurfaceCapability?.qssFeatures || []),
      ...(options.qssFeatures || []),
    ]),
    ...(options.optionalQssFeatures?.length
      ? { optionalQssFeatures: uniqueStrings(options.optionalQssFeatures) }
      : {}),
    nativeCode: false,
  }
}

export function checkNativeCompatibility(options: CheckNativeCompatibilityOptions): NativeCompatibilityResult {
  const diagnostics: NativeCompatibilityDiagnostic[] = []
  const { hostInfo, pluginId } = options
  const compatibility = normalizeNativeRendererCompatibility(options.compatibility)
  if (!compatibility) {
    return { ok: true, diagnostics }
  }

  if (compatibility.nativeCode !== false) {
    diagnostics.push({
      code: 'NATIVE_CODE_NOT_ALLOWED',
      severity: 'error',
      message: 'Dynamic native runtime packages must explicitly declare nativeCode: false.',
      pluginId,
    })
  }

  if (compatibility.packageName && compatibility.packageName !== hostInfo.renderer.packageName) {
    diagnostics.push({
      code: 'NATIVE_RENDERER_PACKAGE_MISMATCH',
      severity: 'error',
      message: `Native renderer package "${hostInfo.renderer.packageName}" does not match required "${compatibility.packageName}".`,
      pluginId,
      required: compatibility.packageName,
      actual: hostInfo.renderer.packageName,
    })
  }

  if (
    compatibility.versionRange
    && !satisfiesNativeRendererVersionRange(hostInfo.renderer.version, compatibility.versionRange)
  ) {
    diagnostics.push({
      code: 'NATIVE_RENDERER_VERSION_MISMATCH',
      severity: 'error',
      message: `Native renderer version "${hostInfo.renderer.version}" does not satisfy "${compatibility.versionRange}".`,
      pluginId,
      required: compatibility.versionRange,
      actual: hostInfo.renderer.version,
    })
  }

  for (const capability of compatibility.capabilities || []) {
    if (!hasCompatibleCapability(hostInfo.renderer.capabilities, capability)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_CAPABILITY_MISSING',
        severity: 'error',
        message: `Required native capability "${capability}" is not available.`,
        pluginId,
        required: capability,
      })
    }
  }

  for (const capability of compatibility.optionalCapabilities || []) {
    if (!hasCompatibleCapability(hostInfo.renderer.capabilities, capability)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_CAPABILITY_MISSING',
        severity: 'warning',
        message: `Optional native capability "${capability}" is not available; fallback behavior must be used.`,
        pluginId,
        required: capability,
      })
    }
  }

  for (const qssFeature of compatibility.qssFeatures || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'qssFeatures', qssFeature)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_QSS_FEATURE_MISSING',
        severity: 'error',
        message: `Required native QSS feature "${qssFeature}" is not available.`,
        pluginId,
        required: qssFeature,
      })
    }
  }

  for (const qssFeature of compatibility.optionalQssFeatures || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'qssFeatures', qssFeature)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_QSS_FEATURE_MISSING',
        severity: 'warning',
        message: `Optional native QSS feature "${qssFeature}" is not available; fallback behavior must be used.`,
        pluginId,
        required: qssFeature,
      })
    }
  }

  for (const assetKind of compatibility.assetKinds || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'assetKinds', assetKind)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_ASSET_KIND_MISSING',
        severity: 'error',
        message: `Required native asset kind "${assetKind}" is not available.`,
        pluginId,
        required: assetKind,
      })
    }
  }

  for (const assetKind of compatibility.optionalAssetKinds || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'assetKinds', assetKind)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_ASSET_KIND_MISSING',
        severity: 'warning',
        message: `Optional native asset kind "${assetKind}" is not available; fallback behavior must be used.`,
        pluginId,
        required: assetKind,
      })
    }
  }

  for (const intentEvent of compatibility.intentEvents || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'intentEvents', intentEvent)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_INTENT_EVENT_MISSING',
        severity: 'error',
        message: `Required native intent event "${intentEvent}" is not available.`,
        pluginId,
        required: intentEvent,
      })
    }
  }

  for (const intentEvent of compatibility.optionalIntentEvents || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'intentEvents', intentEvent)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_INTENT_EVENT_MISSING',
        severity: 'warning',
        message: `Optional native intent event "${intentEvent}" is not available; fallback behavior must be used.`,
        pluginId,
        required: intentEvent,
      })
    }
  }

  for (const quiComponent of compatibility.quiComponents || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'quiComponents', quiComponent)) {
      diagnostics.push({
        code: 'NATIVE_REQUIRED_QUI_COMPONENT_MISSING',
        severity: 'error',
        message: `Required native QUI component "${quiComponent}" is not available.`,
        pluginId,
        required: quiComponent,
      })
    }
  }

  for (const quiComponent of compatibility.optionalQuiComponents || []) {
    if (!hasCapabilityFieldValue(hostInfo.renderer.capabilities, 'quiComponents', quiComponent)) {
      diagnostics.push({
        code: 'NATIVE_OPTIONAL_QUI_COMPONENT_MISSING',
        severity: 'warning',
        message: `Optional native QUI component "${quiComponent}" is not available; fallback behavior must be used.`,
        pluginId,
        required: quiComponent,
      })
    }
  }

  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

export {
  hasCompatibleCapability,
  normalizeNativeRendererCompatibility,
} from './compatibility-helpers'
