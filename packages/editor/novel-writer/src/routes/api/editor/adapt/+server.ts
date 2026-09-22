import type { RequestHandler } from './$types'
import { adaptWriting } from '$server/writing-adaptation'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { writingDocumentSchema } from '../../../../../editor/adaptation'

const schema = z.object({
  base: writingDocumentSchema,
  feedback: z.string().max(6000).optional(),
  prose: z.string().min(1).max(200000),
  context: z.object({
    root: z.string().max(4096), name: z.string().max(4096),
    outline: z.string().max(50000), worldbuilding: z.string().max(50000), characters: z.string().max(50000),
    sources: z.array(z.object({ path: z.string().max(4096), line: z.number(), kind: z.string().max(100) })).max(5000),
    warnings: z.array(z.string().max(4000)).max(1000),
  }).optional(),
})

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { base, prose, context, feedback } = schema.parse(await request.json())
    if (context && context.root !== base.root) throw new Error('项目与源稿不匹配。')
    return json(await adaptWriting(base, prose, context, request.signal, feedback))
  }
  catch (error) {
    // Provider response bodies and private reasoning must never reach the client.
    const message = error instanceof Error ? error.message : 'QS 适配失败。'
    return json({ error: message.startsWith('DeepSeek') ? '模型请求失败，请检查写作设置后重试。' : message }, { status: 422 })
  }
}
