import { chmod, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// node-pty 1.1.0's published macOS prebuild omits spawn-helper's executable bit.
// Fix at install/build time, never by modifying a signed app at runtime.
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('node-pty/package.json'))
  for (const directory of ['build/Release', 'build/Debug', `prebuilds/darwin-${process.arch}`]) {
    const path = join(root, directory, 'spawn-helper')
    const metadata = await stat(path).catch(() => undefined)
    if (metadata && (metadata.mode & 0o111) !== 0o111)
      await chmod(path, metadata.mode | 0o111)
  }
}
