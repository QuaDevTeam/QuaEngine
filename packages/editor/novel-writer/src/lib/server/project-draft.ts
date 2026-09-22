import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getAppHome } from './paths'
import { writeAtomic } from './file-storage'
import { writingDocumentSchema } from '../../../editor/adaptation'

const text = z.string().max(50000)
export const projectDraftSchema = z.object({
  editorSource: writingDocumentSchema.optional(),
  title: z.string().max(120),
  brief: z.string().max(20000),
  mode: z.enum(['step', 'yolo']),
  maxRevisionLoops: z.string().max(3),
  seedWorldbuilding: text,
  seedWorldbuildingModificationInstructions: text,
  seedCharacters: text,
  seedCharactersModificationInstructions: text,
  seedOutline: text,
  seedOutlineModificationInstructions: text,
  allowExpertSeedChanges: z.boolean(),
}).nullable()

export async function readProjectDraft() {
  try {
    return projectDraftSchema.parse(JSON.parse(await readFile(join(getAppHome(), 'editor-project-draft.json'), 'utf8')))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null
    throw error
  }
}

export async function writeProjectDraft(value: unknown): Promise<void> {
  const draft = projectDraftSchema.parse(value)
  await mkdir(getAppHome(), { recursive: true })
  const path = join(getAppHome(), 'editor-project-draft.json')
  await writeAtomic(path, JSON.stringify(draft))
}
