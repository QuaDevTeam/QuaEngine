import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { approvalRequestSchema } from '$server/schemas'
import { recordApproval } from '$server/workflow'

export const POST: RequestHandler = async ({ params, request }) => {
  const input = approvalRequestSchema.parse(await request.json())
  await recordApproval(params.projectId, input)
  return json({ ok: true })
}
