import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const reviewDir = process.env.QUA_GODOT_REVIEW_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../.generated/godot-parity')

export async function requestGodot(request, timeout = 15000) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  const target = resolve(reviewDir, 'requests', id)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(`${target}.tmp`, JSON.stringify(request))
  await rename(`${target}.tmp`, target)
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const result = JSON.parse(await readFile(resolve(reviewDir, 'responses', id), 'utf8'))
      if (result.error)
        throw new Error(result.error)
      return result
    }
    catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Godot review timed out: ${JSON.stringify(request)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = process.argv[2]?.startsWith('{') ? JSON.parse(process.argv[2]) : { action: process.argv[2] || 'snapshot' }
  const result = await requestGodot(request)
  if (request.action === 'snapshot') {
    const path = resolve(reviewDir, 'snapshot.json')
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify({ path, point: result.engine?.point, nodes: result.nodes?.length, texts: result.nodes?.filter(node => node.visible && node.text).map(node => ({ text: node.text, bounds: node.bounds })), warnings: result.warnings }, null, 2)}\n`)
  }
  else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
}
