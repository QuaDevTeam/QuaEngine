import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { restoreTrashedProject } from '$server/store'

export const POST: RequestHandler = async ({ params }) => {
  try {
    const project = await restoreTrashedProject(params.projectId)
    return json({ project })
  }
  catch (caught) {
    if (caught instanceof Error && caught.message.startsWith('Project already exists:')) {
      error(409, caught.message)
    }
    throw caught
  }
}
