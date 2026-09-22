import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Node-API has a stable ABI across Electron releases; no V8/Chromium headers.
// This addon is built for the current architecture and must be unpacked/signed
// with Electron in a distribution, like node-pty's native module.
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const version = require('electron/package.json').version
  const include = [
    process.env.npm_config_nodedir && join(process.env.npm_config_nodedir, 'include/node'),
    join(homedir(), '.electron-gyp', version, 'include/node'),
    join(dirname(process.execPath), '../include/node'),
  ].find(path => path && existsSync(join(path, 'node_api.h')))
  if (!include)
    throw new Error(`Native layer build needs Node-API headers. Install Electron ${version} headers with node-gyp install --target=${version} --dist-url=https://electronjs.org/headers --devdir=${join(homedir(), '.electron-gyp')}, or set npm_config_nodedir.`)
  const root = fileURLToPath(new URL('../', import.meta.url))
  await mkdir(resolve(root, 'dist'), { recursive: true })
  const result = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-O2', '-bundle', '-undefined', 'dynamic_lookup', '-I', include, '-framework', 'AppKit', '-framework', 'QuartzCore', resolve(root, 'src/preview-host/native/layer-host.mm'), '-o', resolve(root, 'dist/native-layer.node')], { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`Native layer build failed: ${result.error || result.status}`)
}
