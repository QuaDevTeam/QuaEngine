import { TerminalService } from './service.js'

const port = process.parentPort!
const service = new TerminalService(event => port.postMessage({ event }))
// Only the main-process client can access this utility-process port.
port.on('message', async ({ data }) => {
  const { id, method, args } = data
  try {
    let value: unknown
    switch (method) {
      case 'create':
        value = service.create(args[0], args[1], args[2], args[3])
        break
      case 'write':
        service.write(args[0], args[1])
        break
      case 'resize':
        service.resize(args[0], args[1], args[2])
        break
      case 'acknowledge':
        service.acknowledge(args[0], args[1])
        break
      case 'close':
        await service.close(args[0])
        break
      case 'dispose':
        await service.dispose()
        break
      default: throw new Error('Unknown terminal operation.')
    }
    port.postMessage({ id, value })
  }
  catch (error) {
    port.postMessage({ id, error: String(error) })
  }
})
