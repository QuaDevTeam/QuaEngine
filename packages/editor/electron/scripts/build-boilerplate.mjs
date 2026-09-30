import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const output = resolve(repository, 'packages/editor/electron/dist/components/boilerplate')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const name of ['visual-novel-vue', 'plugin']) {
  await cp(
    join(repository, 'packages/build/create-qua-game/templates', name),
    join(output, name),
    { recursive: true, dereference: true },
  )
}
await writeFile(join(output, 'component.json'), `${JSON.stringify({
  id: 'boilerplate',
  version: process.env.QUA_EDITOR_BOILERPLATE_VERSION ?? '0.1.0',
  editorRange: process.env.QUA_EDITOR_COMPONENT_EDITOR_RANGE ?? '^0.1.0',
}, null, 2)}\n`)
process.stdout.write(`Editor boilerplate: ${output}\n`)
