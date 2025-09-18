import { createLogger } from '@quajs/logger'

const logger = createLogger('vite-plugin:utils')

/**
 * Check if a file path should be transformed based on include/exclude patterns
 */
export function shouldTransform(
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
 * Normalize a file path for cross-platform compatibility
 */
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/')
}

/**
 * Check if a package follows QuaJS plugin naming conventions
 */
export function isQuaJSPluginPackage(packageName: string): boolean {
  return (
    packageName.startsWith('@quajs/plugin-')
    || packageName.startsWith('quajs-plugin-')
  )
}

/**
 * Generate a unique identifier for plugin modules
 */
export function generatePluginModuleId(pluginName: string): string {
  return pluginName.replace(/[^a-z0-9]/gi, '_')
}

/**
 * Log a message with proper plugin context
 */
export function logPluginMessage(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  switch (level) {
    case 'info':
      logger.info(message)
      break
    case 'warn':
      logger.warn(message)
      break
    case 'error':
      logger.error(message)
      break
  }
}
