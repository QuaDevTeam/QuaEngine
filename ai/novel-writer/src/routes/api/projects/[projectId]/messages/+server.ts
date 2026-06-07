import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { messageRequestSchema } from '$server/schemas'
import { appendUserMessage } from '$server/workflow'

export const POST: RequestHandler = async ({ params, request }) => {
  const input = messageRequestSchema.parse(await request.json())
  const result = await appendUserMessage(params.projectId, input.content)
  return json({ ok: true, ...result })
}
