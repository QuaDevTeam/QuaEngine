import type { RequestHandler } from './$types'
import { emptyTrash, listTrashedProjects } from '$server/store'
import { json } from '@sveltejs/kit'

export const GET: RequestHandler = async () => {
  return json({ projects: await listTrashedProjects() })
}

export const DELETE: RequestHandler = async () => {
  await emptyTrash()
  return json({ deleted: true })
}
