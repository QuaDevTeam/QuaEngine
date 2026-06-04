#!/usr/bin/env node

const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')

const entry = resolve(__dirname, '..', 'dist', 'cli', 'index.js')

if (!existsSync(entry)) {
  console.error('The quack CLI has not been built yet. Run "pnpm --filter @quajs/quack build" first.')
  process.exitCode = 1
}
else {
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exitCode = code ?? 1
  })
}
