import type { EditorPluginProject } from '@quajs/editor-core'
import { join } from 'node:path'
import {
  isExactPackageVersion,
  isNpmPackageName,
  parsePluginMetadata,
  pluginRecord,
} from '@quajs/editor-core'
import { readPackageJson } from './installed.js'

export async function pluginProject(
  root: string,
): Promise<EditorPluginProject | undefined> {
  const manifest = await readPackageJson(join(root, 'package.json'))
  if (pluginRecord(manifest.quajs)?.extension === undefined)
    return undefined
  const name = typeof manifest.name === 'string' ? manifest.name : ''
  const version = typeof manifest.version === 'string' ? manifest.version : ''
  try {
    if (!isNpmPackageName(name) || !isExactPackageVersion(version))
      throw new Error('插件需要合法的 npm 包名和完整版本号。')
    const metadata = parsePluginMetadata(name, manifest)
    if (!metadata)
      throw new Error('插件声明无效。')
    return { name, version, metadata }
  }
  catch (error) {
    return {
      name,
      version,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
