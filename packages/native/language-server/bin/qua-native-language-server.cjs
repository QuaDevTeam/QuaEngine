#!/usr/bin/env node

import('../dist/server.js').catch((error) => {
  console.error(error)
  process.exit(1)
})
