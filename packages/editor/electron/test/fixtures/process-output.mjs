import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

// Reproduce Vite clear-line output and controls split across actual pipe writes.
const chunks = [
  ['stdout', '\u001B'],
  ['stderr', '\u001B[33mWARN stderr survives\u001B[0m\n'],
  ['stdout', '[2'],
  ['stdout', 'K\r\u001B[32mtransforming (12) 中文模块\u001B[0m\r'],
  ['stdout', '\n\u001B[2Kbuilt in 375ms\n'],
  ['stdout', '\u001B]0;hidden window title'],
  ['stdout', '\u0007\u001B]8;;https://example.test'],
  ['stdout', '\u001B'],
  ['stdout', '\\project link\u001B]8;;\u001B\\\n'],
  ['stdout', 'literal [2K and \\u001B[31m stay text\n'],
  ['stdout', '\u001B[36m{\n  "nested": { "count": 42, "literal": "[2K", "safe": "<img src=x>" },\n'],
  ['stdout', '  "items": [1, 2, 3]\n}\u001B[0'],
  ['stdout', 'm\n'],
  ['stderr', '\u001B[31'],
  ['stderr', 'mERROR actionable diagnostic\u001B[0m\n'],
  ['stdout', 'OUTPUT_COMPLETE\n'],
]
for (const [stream, chunk] of chunks) {
  process[stream].write(chunk)
  // eslint-disable-next-line antfu/no-top-level-await -- Standalone child fixture must separate pipe writes.
  await delay(25)
}
const port = process.argv.indexOf('--port')
if (port !== -1) {
  createServer((request, response) => {
    if (request.url === '/more')
      process.stdout.write('\u001B[2Kadditional output\n')
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Console output fixture</title><p>Preview ready</p>')
  }).listen(Number(process.argv[port + 1]), '127.0.0.1')
}
if (process.argv.includes('--fail'))
  process.exitCode = 1
