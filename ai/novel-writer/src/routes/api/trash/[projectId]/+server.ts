import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteTrashedProject } from '$server/store'

export const DELETE: RequestHandler = async ({ params }) => {
  await deleteTrashedProject(params.projectId)
  return json({ deleted: true })
}
