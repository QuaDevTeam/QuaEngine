import { createChildProxy } from './child-proxy.js'
import { editorFetch } from './fetch.js'

let environment: NodeJS.ProcessEnv = {}

/** Kept out of global process.env; only editor-owned tools inherit the relay. */
export function editorNetworkEnvironment(): NodeJS.ProcessEnv {
  return { ...environment }
}

export async function initializeEditorNetwork(): Promise<void> {
  const { app, session } = await import('electron')
  await session.defaultSession.setProxy({ mode: 'system' })
  const proxy = await createChildProxy(url => session.defaultSession.resolveProxy(url), editorFetch)
  environment = proxy.environment
  app.once('will-quit', () => {
    proxy.close()
    environment = {}
  })
}
