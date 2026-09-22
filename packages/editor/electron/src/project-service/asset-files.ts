import type { EditorImportResult } from '@quajs/editor-core'
import { constants } from 'node:fs'
import { copyFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { fileKind, ignoredPath } from './files.js'

export async function projectPath(root: string, path: string, directory = false): Promise<string> {
  if (typeof path !== 'string')
    throw new Error('无效项目路径。')
  const canonical = await realpath(resolve(root, path))
  const local = relative(root, canonical)
  if (local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local) || (local && ignoredPath(local)))
    throw new Error('只能访问当前项目中的文件。')
  const metadata = await stat(canonical)
  if (directory ? !metadata.isDirectory() : !metadata.isFile())
    throw new Error('项目路径类型无效。')
  return canonical
}

export async function importAssetFiles(root: string, directory: string, sources: string[]): Promise<EditorImportResult> {
  const destination = await projectPath(root, directory, true)
  const result: EditorImportResult = { imported: [], skipped: [] }
  for (const source of sources.slice(0, 500)) {
    const name = basename(source)
    if (ignoredPath(name) || ['document', 'other'].includes(fileKind(name))) {
      result.skipped.push(name)
      continue
    }
    try {
      if (!(await stat(source)).isFile())
        throw new Error('Not a file')
      // COPYFILE_EXCL protects both existing assets and destination symlinks.
      await copyFile(source, resolve(destination, name), constants.COPYFILE_EXCL)
      result.imported.push(relative(root, resolve(destination, name)).replaceAll('\\', '/'))
    }
    catch {
      result.skipped.push(name)
    }
  }
  return result
}
