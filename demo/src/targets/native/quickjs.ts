import {
  resolveNativeQuickJsPipelineBridge,
  resolveNativeQuickJsRendererIntentBridge,
  type NativeQuickJsPipelineBridge,
  type NativeQuickJsRendererIntentBridge,
} from '@quajs/engine-native'
import { createDemoNativeSession, type DemoNativeSession } from './session'

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

function requirePipelineBridge(): NativeQuickJsPipelineBridge {
  const bridge = resolveNativeQuickJsPipelineBridge()
  if (!bridge) {
    throw new Error('Native QuickJS pipeline bridge is unavailable.')
  }
  return bridge
}

function requireRendererBridge(): NativeQuickJsRendererIntentBridge {
  const bridge = resolveNativeQuickJsRendererIntentBridge()
  if (!bridge) {
    throw new Error('Native QuickJS renderer intent bridge is unavailable.')
  }
  return bridge
}
