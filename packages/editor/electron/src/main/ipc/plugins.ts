import type { MainServices } from './services.js'
import {
  shell,
} from 'electron'

export function registerPluginsIpc(context: Pick<MainServices, 'handle' | 'publisher' | 'pluginOperation' | 'plugins' | 'publicationOperation' | 'syncPlugins' | 'runtime' | 'projectOpening' | 'documentDirty' | 'closing' | 'closePending'>): void {
  context.handle('editor:plugin-publishing-state', (root: string) =>
    context.publisher.state(root))
  context.handle('editor:plugin-registry', (url: string) => {
    if (context.pluginOperation)
      throw new Error('请等待插件操作结束。')
    return context.plugins.configureRegistry(url)
  })
  context.handle('editor:plugin-login', async () => {
    const login = await context.plugins.service.start()
    await shell.openExternal(login.url)
    return { userCode: login.userCode, expiresIn: login.expiresIn }
  })
  context.handle('editor:plugin-login-poll', () => context.plugins.service.poll())
  context.handle('editor:plugin-logout', () => context.plugins.service.logout())
  context.handle('editor:plugin-claim', (root: string) => context.publisher.claim(root))
  context.handle('editor:plugin-prepare', (root: string) =>
    context.publicationOperation(() => context.publisher.prepare(root)))
  context.handle(
    'editor:plugin-publish',
    (root: string, artifact: string, otp?: string) =>
      context.publicationOperation(() => context.publisher.publish(root, artifact, otp)),
  )
  context.handle('editor:plugin-submit', (root: string) =>
    context.publicationOperation(() => context.publisher.submit(root)))
  context.handle('editor:plugin-publish-cancel', () => context.publisher.cancel())
  context.handle('editor:plugin-marketplace', (root: string, query?: string) =>
    context.plugins.marketplace(root, query))
  context.handle('editor:plugin-details', (root: string, name: string) =>
    context.plugins.details(root, name))
  context.handle('editor:plugin-catalog', (url: string) =>
    context.plugins.configureCatalog(url))
  context.handle('editor:plugin-cancel', () => context.plugins.cancel())
  context.handle(
    'editor:plugin-enable',
    async (root: string, name: string, enabled: boolean) => {
      if (context.pluginOperation)
        throw new Error('插件操作正在进行。')
      context.pluginOperation = true
      try {
        await context.plugins.enable(root, name, enabled)
        await context.syncPlugins()
      }
      finally {
        context.pluginOperation = false
      }
    },
  )
  context.handle(
    'editor:plugin-install',
    async (root: string, name: string, version: string) => {
      if (context.runtime.busy || context.projectOpening || context.pluginOperation || context.documentDirty || context.closing || context.closePending)
        throw new Error('请先保存文档，并等待当前操作结束。')
      context.pluginOperation = true
      try {
        await context.plugins.install(root, name, version)
      }
      finally {
        await context.syncPlugins().catch(() => {})
        context.pluginOperation = false
      }
    },
  )
}
