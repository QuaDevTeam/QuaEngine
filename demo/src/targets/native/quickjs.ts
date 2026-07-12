import {
  resolveNativeQuickJsRendererIntentBridge,
  type NativeQuickJsRendererIntentBridge,
} from '@quajs/engine-native'
import { createDemoNativeSession, type DemoNativeSession } from './session'

let session: DemoNativeSession | undefined
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

export async function bootstrap(fixture?: string) {
  await destroy()
  session = await createDemoNativeSession(fixture)
  const bridge = requireRendererBridge()
  disposeRendererBridge = bridge.subscribe(intent => session?.dispatchIntent(intent))
  return session.renderFrame()
}

export function renderFrame() {
  if (!session) {
    throw new Error('Native QuickJS demo session is not initialized.')
  }
  return session.renderFrame()
}

export async function destroy(): Promise<void> {
  disposeRendererBridge?.()
  disposeRendererBridge = undefined
  const activeSession = session
  session = undefined
  await activeSession?.destroy()
}

function requireRendererBridge(): NativeQuickJsRendererIntentBridge {
  const bridge = resolveNativeQuickJsRendererIntentBridge()
  if (!bridge) {
    throw new Error('Native QuickJS renderer intent bridge is unavailable.')
  }
  return bridge
}
