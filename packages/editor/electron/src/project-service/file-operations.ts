import type { EditorFileOperation, EditorProject } from '@quajs/editor-core'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { ignoredPath } from './files.js'

function localPath(path: string): string {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || ignoredPath(path))
    throw new Error('只能操作项目内的普通文件和文件夹。')
  return path
}
async function inside(root: string, path: string): Promise<string> {
  const canonical = await realpath(path)
  const local = relative(root, canonical)
  if (isAbsolute(local) || local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || canonical !== resolve(path))
    throw new Error('不支持符号链接或项目外的路径。')
  return canonical
}
async function exists(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return undefined
    throw error
  }
}
/** Serialized in the project worker; no renderer filesystem access. */
export async function operationSource(project: EditorProject, path: string): Promise<string> {
  localPath(path)
  if (!project.entries.some(entry => entry.path === path) && !project.directories.includes(path))
    throw new Error('文件已变化，请刷新资源管理器后重试。')
  const source = await inside(project.root, resolve(project.root, path))
  const metadata = await lstat(source)
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile()))
    throw new Error('只支持普通文件和文件夹。')
  return source
}

async function walk(source: string, copying: boolean): Promise<Array<{ path: string, directory: boolean }>> {
  const result: Array<{ path: string, directory: boolean }> = []
  let bytes = 0
  async function visit(path: string, depth: number): Promise<void> {
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile()))
      throw new Error('文件夹包含符号链接或特殊文件，请在系统文件管理器中操作。')
    bytes += metadata.isFile() ? metadata.size : 0
    if (depth > 10 || result.length >= 20000 || (copying && bytes > 1024 * 1024 * 1024))
      throw new Error('此操作超过 10 层、20000 项或 1 GiB 复制上限，请在系统文件管理器中操作。')
    result.push({ path, directory: metadata.isDirectory() })
    if (metadata.isDirectory()) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.name === '.git' || (entry.isDirectory() && ignoredPath(entry.name)))
          throw new Error('文件夹包含仓库、依赖或生成目录，请在系统文件管理器中操作。')
        await visit(join(path, entry.name), depth + 1)
      }
    }
  }
  await visit(source, 0)
  return result
}
export async function operateFiles(project: EditorProject, operation: EditorFileOperation): Promise<void> {
  if (!operation || !['create-file', 'create-directory', 'move', 'copy'].includes(operation.kind))
    throw new Error('无效的文件操作。')
  if (!('destination' in operation))
    throw new Error('缺少目标路径。')
  const targetPath = localPath(operation.destination)
  if (targetPath.split('/').some(part => /[<>:"|?*]/u.test(part) || [...part].some(character => character.charCodeAt(0) < 32) || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)))
    throw new Error('文件名包含系统保留名称或不支持的字符。')
  const target = resolve(project.root, targetPath)
  const parent = await inside(project.root, dirname(target))
  if (!(await lstat(parent)).isDirectory())
    throw new Error('目标文件夹不存在。')
  const found = await exists(target)
  const source = 'path' in operation ? await operationSource(project, operation.path) : undefined
  const original = source && found ? await lstat(source) : undefined
  const caseOnly = operation.kind === 'move' && source?.toLowerCase() === target.toLowerCase() && original?.dev === found?.dev && original?.ino === found?.ino
  if (source && (target === source || target.startsWith(`${source}/`) || target.startsWith(`${source}\\`)))
    throw new Error('不能移动或复制到自身及其子文件夹。')
  if (found && !caseOnly)
    throw new Error('目标名称已存在，请使用其他名称。')
  if (operation.kind === 'create-file') {
    await writeFile(target, '', { flag: 'wx' })
  }
  else if (operation.kind === 'create-directory') {
    await mkdir(target)
  }
  else {
    const entries = await walk(source!, operation.kind === 'copy')
    // Revalidate immediately before changing a path. Rename keeps the source tree intact.
    await inside(project.root, parent)
    await inside(project.root, source!)
    if (await exists(target) && !caseOnly)
      throw new Error('目标名称已存在，请使用其他名称。')
    if (operation.kind === 'move') {
      await rename(source!, target)
    }
    else {
      try {
        for (const entry of entries) {
          await inside(project.root, entry.path)
          const destination = join(target, relative(source!, entry.path))
          if (entry.directory)
            await mkdir(destination)
          else await copyFile(entry.path, destination, constants.COPYFILE_EXCL)
        }
      }
      catch (error) {
        // Never remove a partial destination that another process may have edited.
        throw new Error(`复制未完成，已复制的文件保留在目标位置：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
