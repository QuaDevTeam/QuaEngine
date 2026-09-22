import { spawnSync } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Validate the adapter's final output, including lazily imported server chunks.
// Do not import the handler here: initialization can touch the user's projects.
const buildRoot = process.argv[2] || fileURLToPath(new URL('../build/', import.meta.url))
await access(resolve(buildRoot, 'handler.js'))
const files = (await readdir(buildRoot, { recursive: true }))
  .filter(file => /\.[cm]?js$/u.test(file))
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', resolve(buildRoot, file)], { encoding: 'utf8' })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error(`Novel Writer 构建产物语法检查失败：${file}\n${result.stderr}`)
}
console.log(`Novel Writer: checked ${files.length} generated JavaScript files.`)
