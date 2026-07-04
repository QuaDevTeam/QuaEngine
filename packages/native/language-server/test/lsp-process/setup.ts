import { afterEach, beforeAll } from 'vitest'
import { LspProcessClient, runLspProcessBuilds } from '../lsp-process-harness'

let client: LspProcessClient | undefined

beforeAll(async () => {
  await runLspProcessBuilds()
}, 120_000)

afterEach(async () => {
  await client?.dispose()
  client = undefined
})

export function createClient(): LspProcessClient {
  client = new LspProcessClient()
  return client
}
