import type { NormalizedQuaProjectConfig } from '@quajs/quack/project'
import type { HtmlTagDescriptor, PluginOption, ResolvedConfig } from 'vite'
import type { QuaEngineVitePluginOptions } from '../core/types'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import {
  createQuaProjectWebAssets,
  createQuaProjectWebManifest,
  createQuaProjectWebRuntimeConfig,
  tryLoadQuaProjectConfig,
} from '@quajs/quack/project'
import { logPluginMessage } from '../core/utils'

const VIRTUAL_PROJECT_ID = 'virtual:qua-project'
const RESOLVED_VIRTUAL_PROJECT_ID = `\0${VIRTUAL_PROJECT_ID}`

export function projectConfigPlugin(options: NonNullable<QuaEngineVitePluginOptions['projectConfig']> = true): PluginOption {
  const normalizedOptions = typeof options === 'boolean' ? { enabled: options } : options
  let viteConfig: ResolvedConfig
  let project: NormalizedQuaProjectConfig | undefined

  return {
    name: 'qua-project-config',
    apply() {
      return normalizedOptions.enabled !== false
    },
    async configResolved(config) {
      viteConfig = config
      project = await tryLoadQuaProjectConfig({
        cwd: config.root,
        configPath: normalizedOptions.configPath,
      })
      if (project) {
        logPluginMessage(`Loaded Qua project config: ${project.name}`, 'info')
      }
    },
    resolveId(id) {
      return id === VIRTUAL_PROJECT_ID ? RESOLVED_VIRTUAL_PROJECT_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_PROJECT_ID) {
        return undefined
      }
      if (!project) {
        throw new Error('virtual:qua-project was imported, but no Qua project config was found.')
      }
      const webRuntime = createQuaProjectWebRuntimeConfig(project)
      if (webRuntime.pwa.serviceWorkerUrl) {
        webRuntime.pwa.serviceWorkerUrl = withBase(webRuntime.pwa.serviceWorkerUrl, viteConfig.base)
      }
      return [
        `export const quaProject = ${JSON.stringify(project, null, 2)}`,
        `export const quaWebRuntime = ${JSON.stringify(webRuntime, null, 2)}`,
        'export default quaProject',
        '',
      ].join('\n')
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (!project) {
          return []
        }
        const tags: HtmlTagDescriptor[] = [
          { tag: 'title', children: project.home.title, injectTo: 'head' as const },
          { tag: 'meta', attrs: { name: 'description', content: project.home.description }, injectTo: 'head' as const },
          { tag: 'meta', attrs: { name: 'theme-color', content: project.home.themeColor }, injectTo: 'head' as const },
        ]
        if (project.targets.web.pwa.enabled) {
          tags.push({ tag: 'link', attrs: { rel: 'manifest', href: withBase('/manifest.webmanifest', viteConfig.base) }, injectTo: 'head' })
        }
        else {
          const favicon = createQuaProjectWebAssets(project, 'favicon')[0]
          if (favicon) {
            tags.push({
              tag: 'link',
              attrs: { rel: 'icon', href: favicon.external ? favicon.sourcePath : withBase(`/${faviconFileName(favicon.sourcePath)}`, viteConfig.base) },
              injectTo: 'head',
            })
          }
        }
        return tags
      },
    },
    async generateBundle() {
      if (!project) {
        return
      }
      if (project.targets.web.pwa.enabled) {
        await emitPwaAssets(this, viteConfig, project)
      }
      else {
        await emitFavicon(this, viteConfig, project)
      }
    },
  }
}

async function emitPwaAssets(context: { emitFile: (file: { fileName: string, source: string | Uint8Array, type: 'asset' }) => string }, config: ResolvedConfig, project: NormalizedQuaProjectConfig): Promise<void> {
  for (const asset of createQuaProjectWebAssets(project, 'pwa')) {
    if (asset.external) {
      continue
    }
    context.emitFile({
      type: 'asset',
      fileName: asset.fileName,
      source: await readFile(resolveAssetPath(config.root, asset.sourcePath)),
    })
  }
  const manifest = createQuaProjectWebManifest(project)
  if (manifest) {
    const patchedManifest = {
      ...manifest,
      icons: Array.isArray(manifest.icons)
        ? manifest.icons.map((icon: unknown) => icon && typeof icon === 'object'
          ? { ...icon, src: withBase(String((icon as { src?: unknown }).src || ''), config.base) }
          : icon)
        : [],
    }
    context.emitFile({
      type: 'asset',
      fileName: 'manifest.webmanifest',
      source: `${JSON.stringify(patchedManifest, null, 2)}\n`,
    })
  }
  if (project.targets.web.pwa.serviceWorker === 'generated') {
    context.emitFile({
      type: 'asset',
      fileName: 'qua-service-worker.js',
      source: [
        'self.addEventListener("install", () => self.skipWaiting())',
        'self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))',
        '',
      ].join('\n'),
    })
  }
}

async function emitFavicon(context: { emitFile: (file: { fileName: string, source: string | Uint8Array, type: 'asset' }) => string }, config: ResolvedConfig, project: NormalizedQuaProjectConfig): Promise<void> {
  const favicon = createQuaProjectWebAssets(project, 'favicon')[0]
  if (!favicon || favicon.external) {
    return
  }
  context.emitFile({
    type: 'asset',
    fileName: faviconFileName(favicon.sourcePath),
    source: await readFile(resolveAssetPath(config.root, favicon.sourcePath)),
  })
}

function resolveAssetPath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path)
}

function faviconFileName(sourcePath: string): string {
  const extension = extname(sourcePath) || '.png'
  return `favicon${extension}`
}

function withBase(path: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return path
  }
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}` || cleanPath
}
