import type { Plugin } from 'vite'
import { compileQssScss } from '@quajs/native-ui-compiler'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export interface QssScssPluginOptions {
  /**
   * RegExp (or string converted to one) matching file IDs to process.
   * Defaults to /\.scss$/ — suitable when the plugin is only added to the
   * native-specific Vite config.  Narrow with `include` when sharing a config
   * with web SCSS.
   */
  include?: RegExp | string
}

const DEFAULT_INCLUDE = /\.scss$/

/**
 * Vite plugin: compiles .scss files to flat QSS/CSS for the QuaEngine native
 * renderer.  Add it only to the native-bundle Vite config so all .scss files
 * it sees are treated as QSS targets.
 *
 *   import { qssScssPlugin } from '@quajs/vite-plugin-native-ui'
 *   export default defineConfig({ plugins: [qssScssPlugin()] })
 *
 *   import styles from './native-app.scss?raw'  // → compiled QSS string
 */
export function qssScssPlugin(options: QssScssPluginOptions = {}): Plugin {
  const includeRE = options.include instanceof RegExp
    ? options.include
    : options.include
      ? new RegExp(options.include)
      : DEFAULT_INCLUDE

  return {
    name: 'quaengine:qss-scss',
    enforce: 'pre',

    /**
     * Handle `?raw` imports: Vite's own raw plugin wraps the file in
     * `export default "..."` before the transform hook sees it, so we
     * intercept at the load stage, read the source ourselves, compile it,
     * and return `export default "<compiled-qss>"`.
     */
    async load(id) {
      if (!id.includes('?raw'))
        return null
      const cleanId = id.replace(/\?.*$/, '')
      if (!includeRE.test(cleanId))
        return null

      const src = await readFile(cleanId, 'utf8')
      const result = await compileQssScss(src, {
        url: pathToFileURL(cleanId).href,
        filePath: cleanId,
      })

      if (result.diagnostics.some(d => d.severity === 'error')) {
        const errors = result.diagnostics
          .filter(d => d.severity === 'error')
          .map(d => d.message)
          .join('\n')
        this.error(`[qss-scss] ${cleanId}:\n${errors}`)
        return null
      }
      for (const d of result.diagnostics) {
        if (d.severity === 'warning')
          this.warn(`[qss-scss] ${d.message} (${cleanId})`)
      }

      // Return as a JS module so ?raw resolves to the compiled QSS string.
      return `export default ${JSON.stringify(result.qss)}`
    },

    /**
     * Handle regular (non-raw) imports: compile SCSS to flat QSS so the
     * output can be consumed as plain CSS by downstream plugins.
     */
    async transform(code, id) {
      // ?raw imports are fully handled by the load hook above.
      if (id.includes('?raw'))
        return null
      const cleanId = id.replace(/\?.*$/, '')
      if (!includeRE.test(cleanId))
        return null

      const result = await compileQssScss(code, {
        url: pathToFileURL(cleanId).href,
        filePath: cleanId,
      })

      if (result.diagnostics.some(d => d.severity === 'error')) {
        const errors = result.diagnostics
          .filter(d => d.severity === 'error')
          .map(d => d.message)
          .join('\n')
        this.error(`[qss-scss] ${cleanId}:\n${errors}`)
        return null
      }
      for (const d of result.diagnostics) {
        if (d.severity === 'warning')
          this.warn(`[qss-scss] ${d.message} (${cleanId})`)
      }

      return { code: result.qss, map: null }
    },
  }
}

export default qssScssPlugin
