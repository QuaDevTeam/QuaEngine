import type { QuaNativeHostApi } from '@quajs/native-contracts'
import { NativeHostPlugin } from '@quajs/engine-native'
import { DEMO_UI_FEATURE_SURFACES } from '../../game/ui/features'

export function createDemoNativeHostPlugin(host: QuaNativeHostApi): NativeHostPlugin {
  return new NativeHostPlugin({ host, featureSurfaces: DEMO_UI_FEATURE_SURFACES })
}
