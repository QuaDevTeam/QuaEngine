import type { Plugin } from 'vite'
import { QuaScriptTransformer } from './transformer'
import type { CompilerOptions, DecoratorMapping } from './types'

export interface QuaScriptPluginOptions {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]
  decoratorMappings?: DecoratorMapping
  compilerOptions?: CompilerOptions
}

/**
 * Vite plugin for QuaScript compilation
 */
export function quaScriptPlugin(options: QuaScriptPluginOptions = {}): Plugin {
  const {
    include = /\.(ts|tsx|js|jsx)$/,
    exclude = /node_modules/,
    decoratorMappings,
    compilerOptions
  } = options

  const transformer = new QuaScriptTransformer(decoratorMappings, compilerOptions)

  return {
    name: 'qua-script',
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
        const transformedCode = transformer.transformSource(code)
        return {
          code: transformedCode,
          map: null // TODO: Implement proper source map generation
        }
      } catch (error) {
        this.error(`QuaScript transformation failed in ${id}: ${error}`)
      }
    }
  }
}

function shouldTransform(
  id: string,
  include: string | RegExp | (string | RegExp)[],
  exclude: string | RegExp | (string | RegExp)[]
): boolean {
  const includePatterns = Array.isArray(include) ? include : [include]
  const excludePatterns = Array.isArray(exclude) ? exclude : [exclude]

  // Check exclude patterns first
  for (const pattern of excludePatterns) {
    if (typeof pattern === 'string') {
      if (id.includes(pattern)) return false
    } else if (pattern instanceof RegExp) {
      if (pattern.test(id)) return false
    }
  }

  // Check include patterns
  for (const pattern of includePatterns) {
    if (typeof pattern === 'string') {
      if (id.includes(pattern)) return true
    } else if (pattern instanceof RegExp) {
      if (pattern.test(id)) return true
    }
  }

  return false
}