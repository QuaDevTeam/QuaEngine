import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { runRequestSchema } from '$server/schemas'
import { startWorkflow } from '$server/workflow'

export const POST: RequestHandler = async ({ params, request }) => {
  const input = runRequestSchema.parse(await request.json().catch(() => ({})))
  const run = await startWorkflow(params.projectId, input.mode, input.chapterIndex)
  return json(run, { status: 202 })
}
