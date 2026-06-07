import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { configUpdateSchema } from '$server/schemas'
import { readConfig, toPublicConfig, updateConfig } from '$server/store'

export const GET: RequestHandler = async () => {
  return json(toPublicConfig(await readConfig()))
}

export const PUT: RequestHandler = async ({ request }) => {
  const input = configUpdateSchema.parse(await request.json())
  const current = await readConfig()
  const config = await updateConfig({
    ...input,
    deepSeekApiKey: input.deepSeekApiKey === '' ? current.deepSeekApiKey : input.deepSeekApiKey,
    tavilyApiKey: input.tavilyApiKey === '' ? current.tavilyApiKey : input.tavilyApiKey,
  })
  return json(toPublicConfig(config))
}
