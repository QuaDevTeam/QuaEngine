/* eslint-disable antfu/no-top-level-await */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { rcompare } from 'semver'

// Older editors still need the newest release inside their compatibility window.
const [current, previous] = process.argv.slice(2)
for (const id of ['boilerplate', 'runtime']) {
  const file = join(current, `${id}.json`)
  const next = JSON.parse(await readFile(file, 'utf8'))
  let old
  try {
    old = JSON.parse(await readFile(join(previous, `${id}.json`), 'utf8'))
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  if (old) {
    if (old.product !== next.product || old.schemaVersion !== 1 || old.channel !== next.channel || old.component !== id || !Array.isArray(old.releases))
      throw new Error('Previous component catalog identity mismatch.')
    if (old.releases.some(item => item.version === next.releases[0].version))
      throw new Error('Component versions are immutable; increment the component version.')
    next.releases = [...next.releases, ...old.releases].sort((a, b) => rcompare(a.version, b.version)).slice(0, 32)
  }
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
}
