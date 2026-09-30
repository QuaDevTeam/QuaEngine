import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const source = resolve(repository, 'packages/editor/ui/dist')
const destination = resolve(repository, 'packages/editor/electron/dist/ui')
await rm(destination, { recursive: true, force: true })
await cp(source, destination, { recursive: true, dereference: true })
