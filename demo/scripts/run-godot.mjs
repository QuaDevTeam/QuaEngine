import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/godot/workspace')
const godot = process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot')
try {
  await access(resolve(project, 'project.godot'))
}
catch {
  console.error('Godot project is missing. Run pnpm --dir demo build:godot first.')
  process.exit(1)
}
// Passing project.godot itself opens the editor. --path runs the main scene;
// edit:godot adds --editor explicitly. spawn preserves paths containing spaces.
const child = spawn(godot, ['--path', project, ...process.argv.slice(2)], { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.once('error', (error) => {
  console.error(`Cannot launch Godot: ${error.message}. Set GODOT_BIN to the Godot executable.`)
  process.exitCode = 1
})
child.once('exit', code => process.exitCode = code ?? 1)
