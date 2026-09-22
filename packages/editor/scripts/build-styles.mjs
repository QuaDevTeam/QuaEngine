import { createRequire } from 'node:module'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
const require = createRequire(resolve('package.json'))
const { compile } = require('sass-embedded')
const [source, output] = process.argv.slice(2)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, compile(source, { style: 'compressed' }).css)
