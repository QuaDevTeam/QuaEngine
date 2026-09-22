import type { RequestHandler } from './$types'
import { writeProjectDraft } from '$server/project-draft'
import { json } from '@sveltejs/kit'

export const PUT: RequestHandler = async ({ request }) => {
  await writeProjectDraft(await request.json())
  return json({ saved: true })
}
