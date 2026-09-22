import type { EditorInstalledPlugin } from '@quajs/editor-core'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  isNpmPackageName,
  parsePluginMetadata,
  pluginRecord,
} from '@quajs/editor-core'

export interface InstalledPackage extends EditorInstalledPlugin {
  directory: string
}

export async function readPackageJson(
  path: string,
): Promise<Record<string, unknown>> {
  const info = await stat(path)
  if (!info.isFile() || info.size > 256 * 1024)
    throw new Error('package.json 超过 256 KiB 上限。')
  const bytes = await readFile(path)
  if (bytes.length > 256 * 1024)
    throw new Error('package.json 过大。')
  const value = pluginRecord(JSON.parse(bytes.toString('utf8')))
  if (!value)
    throw new Error('无效的 package.json。')
  return value
}

export async function installedPlugins(
  root: string,
): Promise<{ packages: InstalledPackage[], issues: string[] }> {
  const manifest = await readPackageJson(join(root, 'package.json'))
  const names = [
    ...new Set([
      ...Object.keys(pluginRecord(manifest.dependencies) ?? {}),
      ...Object.keys(pluginRecord(manifest.devDependencies) ?? {}),
      ...Object.keys(pluginRecord(manifest.optionalDependencies) ?? {}),
    ]),
  ]
  const packages: InstalledPackage[] = []
  const issues: string[] = []
  if (names.length > 300)
    issues.push('仅检查前 300 个直接依赖。')
  for (const name of names.slice(0, 300)) {
    if (!isNpmPackageName(name))
      continue
    let directory = root
    for (let level = 0; level < 16; level++) {
      const candidate = join(directory, 'node_modules', name, 'package.json')
      try {
        const canonical = await realpath(candidate)
        const metadata = await readPackageJson(canonical)
        if (metadata.name !== name)
          throw new Error('依赖包名与安装目录不一致。')
        const plugin = parsePluginMetadata(name, metadata)
        if (plugin) {
          packages.push({
            name,
            version: String(metadata.version ?? ''),
            description:
              typeof metadata.description === 'string'
                ? metadata.description.slice(0, 600)
                : '',
            metadata: plugin,
            enabled: false,
            directory: dirname(canonical),
          })
        }
        break
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          issues.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
          )
          break
        }
      }
      const parent = dirname(directory)
      if (parent === directory)
        break
      directory = parent
    }
  }
  return { packages, issues }
}

export async function packageFile(
  directory: string,
  file: string,
): Promise<string> {
  const root = await realpath(directory)
  const path = await realpath(resolve(root, file))
  const local = relative(root, path)
  if (!local || local.startsWith('..') || isAbsolute(local))
    throw new Error('插件入口超出包目录。')
  const info = await stat(path)
  if (!info.isFile() || info.size > 8 * 1024 * 1024)
    throw new Error('插件资源超过 8 MiB 上限。')
  return path
}
