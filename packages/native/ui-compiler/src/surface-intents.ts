export const nativeUiIntentSurfaceKinds = [
  'Backdrop',
  'Box',
  'Button',
  'Panel',
] as const

export type NativeUiIntentSurfaceKind = typeof nativeUiIntentSurfaceKinds[number]

const NATIVE_UI_INTENT_SURFACE_KIND_SET = new Set<string>(nativeUiIntentSurfaceKinds)

export function canProjectNativeUiIntent(kind: string): kind is NativeUiIntentSurfaceKind {
  return NATIVE_UI_INTENT_SURFACE_KIND_SET.has(kind)
}
