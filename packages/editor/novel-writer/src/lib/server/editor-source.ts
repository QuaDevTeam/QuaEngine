import type { EditorWritingDocument } from '@quajs/editor-core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writingDocumentSchema } from '../../../editor/adaptation'
import { getProjectRoot } from './paths'
import { writeAtomic } from './file-storage'

/** Stored separately so project lists and agent prompts never contain full source snapshots. */
export async function readEditorSource(projectId: string): Promise<EditorWritingDocument | null> {
  try {
    return writingDocumentSchema.parse(JSON.parse(await readFile(join(getProjectRoot(projectId), 'editor-source.json'), 'utf8')))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function writeEditorSource(projectId: string, root: string | undefined, document: EditorWritingDocument): Promise<void> {
  const value = writingDocumentSchema.parse(document)
  if (!root || value.root !== root) throw new Error('源稿属于另一个项目，请先关联当前项目。')
  const path = join(getProjectRoot(projectId), 'editor-source.json')
  await writeAtomic(path, JSON.stringify(value))
}
