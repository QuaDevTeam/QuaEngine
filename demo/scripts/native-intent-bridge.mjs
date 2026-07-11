import { readFile } from 'node:fs/promises'

export function startNativeIntentPump(controller, intentPath, onError = console.error) {
  let processedLineCount = 0
  let stopped = false
  let pumping = false
  const timer = setInterval(() => {
    if (stopped || pumping) {
      return
    }
    pumping = true
    void pump().catch(onError).finally(() => {
      pumping = false
    })
  }, 16)

  async function pump() {
    let source
    try {
      source = await readFile(intentPath, 'utf8')
    }
    catch (error) {
      if (error?.code === 'ENOENT') {
        return
      }
      throw error
    }
    const records = source.split(/\r?\n/)
    if (!source.endsWith('\n')) {
      records.pop()
    }
    const lines = records.filter(Boolean)
    if (lines.length < processedLineCount) {
      processedLineCount = 0
    }
    for (const line of lines.slice(processedLineCount)) {
      await controller.dispatchIntent(JSON.parse(line))
      processedLineCount += 1
    }
  }

  return async () => {
    stopped = true
    clearInterval(timer)
    while (pumping) {
      await new Promise(resolve => setTimeout(resolve, 1))
    }
  }
}
