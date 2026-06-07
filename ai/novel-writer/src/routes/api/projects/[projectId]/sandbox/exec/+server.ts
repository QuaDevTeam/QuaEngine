import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { SandboxProvider } from '$server/sandbox'
import { sandboxExecRequestSchema } from '$server/schemas'
import { readProject } from '$server/store'

export const POST: RequestHandler = async ({ params, request }) => {
  const input = sandboxExecRequestSchema.parse(await request.json())
  const project = await readProject(params.projectId)
  const result = await new SandboxProvider().exec(project, input)
  return json(result)
}
