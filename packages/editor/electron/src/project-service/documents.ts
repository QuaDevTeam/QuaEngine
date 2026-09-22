import type { EditorDocument } from '@quajs/editor-core'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { ignoredPath, MAX_DOCUMENT_BYTES, TEXT_EXTENSIONS } from './files.js'

export async function resolveDocumentPath(root: string, path: string): Promise<string> {
  if (typeof path !== 'string')
    throw new Error('无效文件路径。')
  const canonical = await realpath(resolve(root, path))
  const local = relative(root, canonical)
  if (!local || local.startsWith('..') || isAbsolute(local) || ignoredPath(local))
    throw new Error('只能编辑当前项目中的源文件。')
  if (!TEXT_EXTENSIONS.has(extname(canonical).toLowerCase()))
    throw new Error('此文件类型尚不支持文本编辑。')
  const metadata = await stat(canonical)
  if (!metadata.isFile() || metadata.size > MAX_DOCUMENT_BYTES)
    throw new Error('此文件不是可编辑文本，或超过 2 MB 上限。')
  return canonical
}

/** Async bounded file I/O bypasses CPU-bound project/language/check workers. */
export async function readProjectDocument(root: string, path: string): Promise<EditorDocument> {
  const canonical = await resolveDocumentPath(root, path)
  const bytes = await readFile(canonical)
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new Error('文档超过 2 MB 编辑上限。')
  return { path: canonical, text: bytes.toString('utf8'), revision: createHash('sha256').update(bytes).digest('hex') }
}
