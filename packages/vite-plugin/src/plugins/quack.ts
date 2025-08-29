import type { Plugin } from 'vite'
import type { AssetBundleManifest, QuaEngineVitePluginOptions } from '../core/types'
import { relative, resolve } from 'node:path'
import { logPluginMessage, normalizePath } from '../core/utils'

/**
 * Vite plugin for Quack asset bundling integration
 *
 * This plugin:
 * 1. Integrates with the Quack bundler
 * 2. Processes game assets during build
 * 3. Generates asset bundles and manifests
 * 4. Provides development-time asset watching
 */
export function quackPlugin(options: QuaEngineVitePluginOptions['assetBundling'] = {}): Plugin {
  const {
    enabled = true,
    source = 'assets',
    output = 'dist/assets',
    format = 'auto',
    compression = { algorithm: 'deflate', level: 6 },
    encryption = { enabled: false, algorithm: 'xor' },
  } = options

  if (!enabled) {
    return {
      name: 'quack-disabled',
      apply: () => false,
    }
  }

  let projectRoot: string
  let bundleManifest: AssetBundleManifest | null = null

  return {
    name: 'quack',
    configResolved(config) {
      projectRoot = config.root
      logPluginMessage('Quack asset bundler initialized', 'info')
    },

    async buildStart() {
      try {
        const sourcePath = resolve(projectRoot, source)
        const outputPath = resolve(projectRoot, output)

        logPluginMessage(`Asset bundling: ${sourcePath} -> ${outputPath}`, 'info')

        // Check if source directory exists
        const fs = await import('node:fs/promises')
        try {
          await fs.access(sourcePath)
        }
        catch {
          logPluginMessage(`Asset source directory not found: ${sourcePath}`, 'warn')
          return
        }

        // Import and configure Quack bundler
        const quackModule = await import('@quajs/quack')
        const QuackBundler = quackModule.QuackBundler || quackModule.default?.QuackBundler
        const defineConfig = quackModule.defineConfig || quackModule.default?.defineConfig || ((config: any) => config)

        const quackConfig = defineConfig({
          source: sourcePath,
          output: outputPath + (format === 'qpk' ? '.qpk' : '.zip'),
          format: format as any,
          compression,
          encryption,
          verbose: true,
        })

        const bundler = new QuackBundler(quackConfig)

        // Create bundle
        const stats = await bundler.bundle()

        // Generate manifest for Vite
        bundleManifest = {
          version: '1.0.0',
          buildNumber: stats.buildNumber || Date.now(),
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          assets: stats.assetsByType,
          locales: stats.locales.map(l => l.code),
        }

        logPluginMessage(`Asset bundle created: ${stats.totalFiles} files, ${formatBytes(stats.totalSize)}`, 'info')
      }
      catch (error) {
        logPluginMessage(`Asset bundling failed: ${error}`, 'error')
        throw error
      }
    },

    generateBundle() {
      if (bundleManifest) {
        // Emit asset manifest as a build artifact
        this.emitFile({
          type: 'asset',
          fileName: 'asset-manifest.json',
          source: JSON.stringify(bundleManifest, null, 2),
        })

        logPluginMessage('Asset manifest generated', 'info')
      }
    },

    configureServer(server) {
      // Development mode: watch assets directory
      if (process.env.NODE_ENV !== 'production') {
        const sourcePath = resolve(projectRoot, source)

        server.watcher.add(sourcePath)

        server.watcher.on('change', (file) => {
          const relativePath = relative(sourcePath, file)
          if (file.startsWith(sourcePath)) {
            logPluginMessage(`Asset changed: ${relativePath}`, 'info')
            // Trigger HMR for asset changes
            server.ws.send({
              type: 'custom',
              event: 'asset-change',
              data: {
                file: normalizePath(relativePath),
                timestamp: Date.now(),
              },
            })
          }
        })

        server.watcher.on('add', (file) => {
          const relativePath = relative(sourcePath, file)
          if (file.startsWith(sourcePath)) {
            logPluginMessage(`Asset added: ${relativePath}`, 'info')
            server.ws.send({
              type: 'custom',
              event: 'asset-add',
              data: {
                file: normalizePath(relativePath),
                timestamp: Date.now(),
              },
            })
          }
        })

        server.watcher.on('unlink', (file) => {
          const relativePath = relative(sourcePath, file)
          if (file.startsWith(sourcePath)) {
            logPluginMessage(`Asset removed: ${relativePath}`, 'info')
            server.ws.send({
              type: 'custom',
              event: 'asset-remove',
              data: {
                file: normalizePath(relativePath),
                timestamp: Date.now(),
              },
            })
          }
        })
      }
    },
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
