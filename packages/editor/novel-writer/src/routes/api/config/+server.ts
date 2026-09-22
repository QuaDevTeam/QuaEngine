import type { RequestHandler } from './$types'
import { configUpdateSchema } from '$server/schemas'
import { readConfig, toPublicConfig, updateConfig } from '$server/store'
import { json } from '@sveltejs/kit'

export const GET: RequestHandler = async () => {
  return json(toPublicConfig(await readConfig()))
}

export const PUT: RequestHandler = async ({ request }) => {
  const input = configUpdateSchema.parse(await request.json())
  const current = await readConfig()
  const config = await updateConfig({
    ...input,
    deepSeekApiKey: input.deepSeekApiKey?.trim() || current.deepSeekApiKey,
    tavilyApiKey: input.tavilyApiKey?.trim() || current.tavilyApiKey,
  })
  return json(toPublicConfig(config))
}
