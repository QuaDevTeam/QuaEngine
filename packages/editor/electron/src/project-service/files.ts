import type { EditorFileEntry, EditorFileKind } from '@quajs/editor-core'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

export const TEXT_EXTENSIONS = new Set(['.qs', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.qui', '.qss', '.json', '.jsonc', '.yaml', '.yml', '.css', '.scss', '.vue', '.svelte', '.html', '.md', '.txt', '.toml'])
export function fileKind(path: string): EditorFileKind {
  const extension = extname(path).toLowerCase()
  if (TEXT_EXTENSIONS.has(extension))
    return 'document'
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.bmp', '.ico'].includes(extension))
    return 'image'
  if (['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus'].includes(extension))
    return 'audio'
  if (['.mp4', '.webm', '.mov', '.m4v', '.ogv'].includes(extension))
    return 'video'
  if (['.ttf', '.otf', '.woff', '.woff2'].includes(extension))
    return 'font'
  if (['.qpk', '.zip'].includes(extension))
    return 'package'
  return 'other'
}
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'target', 'coverage', 'build'])
export function ignoredPath(path: string): boolean {
  return path.split(/[\\/]/).some(part => part.startsWith('.') || SKIP_DIRECTORIES.has(part))
}
export async function listSourceFiles(root: string): Promise<{ files: string[], entries: EditorFileEntry[], directories: string[], truncated: boolean }> {
  const files: string[] = []
  const entries: EditorFileEntry[] = []
  const directories: string[] = []
  let truncated = false
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 10 || entries.length >= 20000 || directories.length >= 1024) {
      truncated = true
      return
    }
    directories.push(directory)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entries.length >= 20000) {
        truncated = true
        break
      }
      if (ignoredPath(entry.name))
        continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(path, depth + 1)
      }
      else if (entry.isFile()) {
        const local = relative(root, path).replaceAll('\\', '/')
        const metadata = await stat(path).catch(() => undefined)
        if (!metadata)
          continue
        const kind = fileKind(local)
        entries.push({ path: local, kind, size: metadata.size, modified: metadata.mtimeMs })
        if (kind === 'document')
          files.push(local)
      }
    }
  }
  await visit(root, 0)
  return { files: files.sort((a, b) => a.localeCompare(b)), entries, directories, truncated }
}
