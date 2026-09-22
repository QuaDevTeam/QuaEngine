import type { NativeJscPipelineBridge, NativeJscRendererIntentBridge } from '@quajs/engine-native'
import type { DemoNativeSession } from './session'
import {

  resolveNativeJscPipelineBridge,
  resolveNativeJscRendererIntentBridge,
} from '@quajs/engine-native'
import { createDemoNativeSession } from './session'

let session: DemoNativeSession | undefined
let disposePipelineBridge: (() => void) | undefined
let disposeRendererBridge: (() => void) | undefined

export function getInteractionDiagnostics() {
  return session?.getInteractionDiagnostics() ?? {
    intentCount: 0,
    lastIntentType: null,
    lastAction: null,
    phases: [],
    error: null,
  }
}

export async function bootstrap() {
  await destroy()
  session = await createDemoNativeSession()
  const bridge = requireRendererBridge()
  disposeRendererBridge = bridge.subscribe(intent => session?.dispatchIntent(intent))
  disposePipelineBridge = session.connectPipelineBridge(requirePipelineBridge())
  return true
}

export async function destroy(): Promise<void> {
  disposePipelineBridge?.()
  disposePipelineBridge = undefined
  disposeRendererBridge?.()
  disposeRendererBridge = undefined
  const activeSession = session
  session = undefined
  await activeSession?.destroy()
}

function requirePipelineBridge(): NativeJscPipelineBridge {
  const bridge = resolveNativeJscPipelineBridge()
  if (!bridge) {
    throw new Error('Native JavaScriptCore pipeline bridge is unavailable.')
  }
  return bridge
}

function requireRendererBridge(): NativeJscRendererIntentBridge {
  const bridge = resolveNativeJscRendererIntentBridge()
  if (!bridge) {
    throw new Error('Native JavaScriptCore renderer intent bridge is unavailable.')
  }
  return bridge
}
