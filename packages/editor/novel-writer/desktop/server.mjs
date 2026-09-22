import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { startupErrorMessage } from './startup-error.mjs'
import { lockStorage } from './storage-lock.mjs'

// Electron utility entry: the writing runtime never runs in the workbench/main thread.
const parent = process.parentPort
if (!parent)
  throw new Error('Novel Writer desktop service requires an Electron utility process.')
const token = randomBytes(32).toString('hex')
process.env.NOVEL_WRITER_EMBEDDED = '1'
process.env.BODY_SIZE_LIMIT = '8M'
let handler
const server = createServer((request, response) => {
  const authorization = request.headers.authorization || ''
  const supplied = Buffer.from(authorization)
  const expected = Buffer.from(`Bearer ${token}`)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.writeHead(401).end()
    return
  }
  // Do not forward the transport credential into SvelteKit/client serialization.
  delete request.headers.authorization
  if (!handler) {
    response.writeHead(503).end()
    return
  }
  handler(request, response)
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const origin = `http://127.0.0.1:${server.address().port}`
process.env.ORIGIN = origin
try {
  await lockStorage()
  ;({ handler } = await import('../build/handler.js'))
  parent.postMessage({ type: 'ready', origin, token })
}
catch (error) {
  parent.postMessage({ type: 'error', message: startupErrorMessage(error) })
  server.close()
  process.exitCode = 1
}
parent.on('message', ({ data }) => {
  if (data?.type === 'state') {
    const reply = state => parent.postMessage({ id: data.id, state })
    if (!process.emit('novel-writer:state', reply))
      reply({ running: false })
  }
  else if (data?.type === 'shutdown') {
    const finish = () => {
      server.closeAllConnections()
      server.close(() => process.exit(0))
    }
    if (!process.emit('novel-writer:shutdown', finish))
      finish()
  }
})
