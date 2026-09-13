#!/usr/bin/env node

if (!process.argv.some(arg => arg === '--stdio' || arg === '--node-ipc' || arg.startsWith('--socket='))) {
  process.argv.push('--stdio')
}

import('../dist/server.js').catch((error) => {
  console.error(error)
  process.exit(1)
})
