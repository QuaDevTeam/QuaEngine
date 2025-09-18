import type { Plugin, ViteDevServer } from 'vite'
import type { CompilerOptions, DecoratorMapping } from '../core/types'
import process from 'node:process'
import { getHotReloadManager } from '../core/hot-reload'
import { createHotReloadAwareTransformer } from './hot-reload-transformer'

export interface QuaScriptPluginOptions {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]
  decoratorMappings?: DecoratorMapping
  compilerOptions?: CompilerOptions
  /** Project root for plugin discovery */
  projectRoot?: string
  /** Enable hot-reload (default: true in development) */
  hotReload?: boolean
}

/**
 * Vite plugin for QuaScript compilation with hot-reload support
 */
export function quaScriptPlugin(options: QuaScriptPluginOptions = {}): Plugin {
  const {
    include = /\.(ts|tsx|js|jsx)$/,
    exclude = /node_modules/,
    decoratorMappings,
    compilerOptions,
    projectRoot,
    hotReload = process.env.NODE_ENV !== 'production',
  } = options

  let transformer: ReturnType<typeof createHotReloadAwareTransformer>
  let server: ViteDevServer | undefined
  const hotReloadManager = getHotReloadManager(projectRoot)

  return {
    name: 'qua-script',

    configResolved(config) {
      // Create transformer after config is resolved
      transformer = createHotReloadAwareTransformer(decoratorMappings, {
        ...compilerOptions,
        projectRoot: projectRoot || config.root,
      })

      // Enable hot-reload in development
      if (hotReload && config.command === 'serve') {
        hotReloadManager.enable()
      }
    },

    configureServer(devServer) {
      server = devServer

      if (!hotReload)
        return

      // Set up hot-reload callbacks
      hotReloadManager.onHotReload(async (event) => {
        if (!server)
          return

        // Notify connected clients about QuaScript changes
        server.ws.send({
          type: 'custom',
          event: 'qua-script:reload',
          data: {
            type: event.type,
            file: event.file,
            timestamp: event.timestamp,
          },
        })

        // For plugin changes, reload affected modules
        if (event.type === 'plugin-change' || event.type === 'config-change') {
          // Find and reload all QuaScript files that might be affected
          const moduleGraph = server.moduleGraph
          const quaScriptModules = Array.from(moduleGraph.urlToModuleMap.values())
            .filter(mod => mod.file && shouldTransform(mod.file, include, exclude))

          for (const mod of quaScriptModules) {
            if (mod.file) {
              // Invalidate transformer cache
              transformer.invalidateFile(mod.file)

              // Trigger HMR update
              moduleGraph.invalidateModule(mod)
              server.reloadModule(mod)
            }
          }
        }
      })

      // Watch plugin-related files
      const chokidar = devServer.watcher

      // Watch plugin files
      chokidar.add([
        '**/qua.plugins.json',
        '**/plugins/**/*.{js,ts}',
        '**/*plugin*.{js,ts}',
        '**/package.json', // For dependency changes
      ])

      // Handle file changes
      chokidar.on('change', (filePath) => {
        if (shouldWatchFile(filePath)) {
          hotReloadManager.handleFileChange(filePath)
        }
      })
    },

    transform(code: string, id: string) {
      // Check if file should be processed
      if (!shouldTransform(id, include, exclude)) {
        return null
      }

      // Check if code contains qs template literals
      if (!code.includes('qs`')) {
        return null
      }

      try {
        // Use hot-reload aware transformer
        const transformedCode = transformer.transformSource(code, id)

        // In development with HMR, add hot-reload client code
        if (hotReload && server) {
          const hmrCode = generateHMRCode(id)
          return {
            code: transformedCode + hmrCode,
            map: null, // TODO: Implement proper source map generation
          }
        }

        return {
          code: transformedCode,
          map: null,
        }
      }
      catch (error) {
        this.error(`QuaScript transformation failed in ${id}: ${error}`)
      }
    },

    handleHotUpdate(ctx) {
      if (!hotReload)
        return

      const { file, read } = ctx

      // Handle QuaScript file changes
      if (shouldTransform(file, include, exclude)) {
        // Read file content for hot-reload manager
        read().then((content) => {
          hotReloadManager.handleFileChange(file, content)
        }).catch(console.error)

        // Return undefined to let Vite handle the update normally
        return undefined
      }

      // Handle plugin-related file changes
      if (shouldWatchFile(file)) {
        hotReloadManager.handleFileChange(file)

        // Return empty array to prevent default HMR
        return []
      }
    },

    buildEnd() {
      // Cleanup in production builds
      if (!hotReload) {
        transformer.dispose()
      }
    },
  }
}

/**
 * Check if a file should be transformed
 */
function shouldTransform(
  id: string,
  include: string | RegExp | (string | RegExp)[],
  exclude: string | RegExp | (string | RegExp)[],
): boolean {
  const includePatterns = Array.isArray(include) ? include : [include]
  const excludePatterns = Array.isArray(exclude) ? exclude : [exclude]

  // Check exclude patterns first
  for (const pattern of excludePatterns) {
    if (typeof pattern === 'string') {
      if (id.includes(pattern))
        return false
    }
    else if (pattern instanceof RegExp) {
      if (pattern.test(id))
        return false
    }
  }

  // Check include patterns
  for (const pattern of includePatterns) {
    if (typeof pattern === 'string') {
      if (id.includes(pattern))
        return true
    }
    else if (pattern instanceof RegExp) {
      if (pattern.test(id))
        return true
    }
  }

  return false
}

/**
 * Check if a file should be watched for plugin changes
 */
function shouldWatchFile(filePath: string): boolean {
  return (
    filePath.includes('qua.plugins.json')
    || filePath.includes('package.json')
    || filePath.includes('plugin')
    || filePath.endsWith('.plugin.js')
    || filePath.endsWith('.plugin.ts')
  )
}

/**
 * Generate HMR client code for QuaScript files
 */
function generateHMRCode(id: string): string {
  return `
// QuaScript HMR support
if (import.meta.hot) {
  import.meta.hot.on('qua-script:reload', (data) => {
    if (data.type === 'plugin-change' || data.type === 'config-change') {
      // Force reload for plugin changes
      import.meta.hot.invalidate()
    } else if (data.file === '${id}') {
      // Hot reload this specific file
      import.meta.hot.invalidate()
    }
  })

  // Accept HMR updates
  import.meta.hot.accept()
}
`
}
