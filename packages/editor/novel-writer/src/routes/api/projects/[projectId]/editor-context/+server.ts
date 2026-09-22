import type { RequestHandler } from './$types'
import { mergeEditorContext } from '$server/editor-context'
import { projectSeedSchema } from '$server/schemas'
import { listArtifacts, readProject, updateProjectInput } from '$server/store'
import { isProjectRunning } from '$server/workflow'
import { json } from '@sveltejs/kit'
import { z } from 'zod'

export const POST: RequestHandler = async ({ params, request }) => {
  const project = await readProject(params.projectId)
  if (project.status === 'running' || isProjectRunning(project.id))
    return json({ error: '请等待当前生成结束，再补齐项目设定。' }, { status: 409 })
  const input = z.object({ root: z.string().min(1).max(4096), seed: projectSeedSchema }).parse(await request.json())
  const artifacts = await listArtifacts(project.id)
  try {
    const next = mergeEditorContext(project, { ...input, seed: input.seed ?? {} }, new Set(artifacts.filter(item => item.status !== 'rejected').map(item => item.stage)))
    await updateProjectInput(next, [])
    return json({ project: next })
  }
  catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
