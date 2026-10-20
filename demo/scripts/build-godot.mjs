import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(dirname(fileURLToPath(import.meta.resolve('@quajs/quack'))), '../bin/quack.cjs')
const env = { ...process.env }
// Homebrew's minimal ffmpeg omits Theora. Prefer the full build when installed,
// without changing the user's shell PATH or installing anything automatically.
if (process.platform === 'darwin') {
  const full = ['/opt/homebrew/opt/ffmpeg-full/bin', '/usr/local/opt/ffmpeg-full/bin'].find(path => existsSync(resolve(path, 'ffmpeg')))
  if (full)
    env.PATH = `${full}${delimiter}${env.PATH || ''}`
}
const child = spawn(process.execPath, [cli, 'project', 'build', '--target', 'godot', '--all', ...process.argv.slice(2)], { cwd: demo, env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
