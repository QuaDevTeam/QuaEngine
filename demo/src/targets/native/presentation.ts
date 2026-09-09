import { createNativeRendererViewProjection, type NativeRendererEngineViewProjection } from '@quajs/engine-native'
import { DEMO_NATIVE_FEATURE_SURFACES } from './features'

/** Pure product styling of the native DTO, analogous to the Web stylesheet. */
export function projectDemoNativeView(view: NativeRendererEngineViewProjection) {
  const projected = createNativeRendererViewProjection(view, { featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES, projectAnimations: false })
  const dialogue = projected.dialogue as Record<string, unknown> | undefined
  if (dialogue) dialogue.chrome = {
    minHeight: 250, paddingX: 52, paddingTop: 30, paddingBottom: 76, speakerGap: 14,
    fillColor: '#f5f3ebf5', borderColor: '#c7d2c5', accentColor: '#42796e',
    textStyle: { fontFamily: ['Noto Sans'], fontSize: 30, lineHeight: 54, color: '#29453f' },
    speakerStyle: { fontFamily: ['Noto Sans'], fontSize: 25, lineHeight: 38, color: '#42796e', fontWeight: 600 },
  }
  const choices = projected.choices as Record<string, unknown> | undefined
  if (choices) choices.chrome = { width: 1040, fontSize: 26, lineHeight: 44.2, paddingX: 40, paddingY: 22, gap: 14,
    fillColor: '#f5f3eb', textColor: '#29453f', borderColor: '#42796e' }
  for (const character of (projected.characters ?? []) as { position?: Record<string, unknown> }[]) {
    character.position = { width: 640, height: 1280, ...character.position }
  }
  return projected
}
