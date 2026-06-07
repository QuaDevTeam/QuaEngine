import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createProjectSchema } from '$server/schemas'
import { createProject, listProjects } from '$server/store'

export const GET: RequestHandler = async () => {
  return json({ projects: await listProjects() })
}

export const POST: RequestHandler = async ({ request }) => {
  const input = createProjectSchema.parse(await request.json())
  const project = await createProject(input)
  return json({ project }, { status: 201 })
}
