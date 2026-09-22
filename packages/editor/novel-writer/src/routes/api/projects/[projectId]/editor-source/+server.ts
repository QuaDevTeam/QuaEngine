import type { RequestHandler } from './$types'
import { readEditorSource, writeEditorSource } from '$server/editor-source'
import { readProject } from '$server/store'
import { json } from '@sveltejs/kit'
import { writingDocumentSchema } from '../../../../../../editor/adaptation'

export const GET: RequestHandler = async ({ params }) => {
  await readProject(params.projectId)
  return json({ document: await readEditorSource(params.projectId) })
}
export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const project = await readProject(params.projectId)
    const document = writingDocumentSchema.parse(await request.json())
    await writeEditorSource(project.id, project.editorRoot, document)
    return json({ document })
  }
  catch (error) {
    return json({ error: error instanceof Error ? error.message : '无法保存源稿关联。' }, { status: 409 })
  }
}
