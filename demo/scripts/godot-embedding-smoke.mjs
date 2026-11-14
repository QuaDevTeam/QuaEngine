import { spawn } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = join(demo, 'dist/godot/workspace')
const fixture = join(project, '.embedding-smoke')
const output = join(demo, '.generated/godot-embedding-smoke')
const godot = process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot')
await mkdir(fixture, { recursive: true })
try {
  await cp(join(demo, '../packages/platform/godot-host/test/embedding-smoke.gd'), join(fixture, 'smoke.gd'))
  await writeFile(join(fixture, 'smoke.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://.embedding-smoke/smoke.gd" id="1"]\n[node name="EmbeddingSmoke" type="Control"]\nlayout_mode=3\nanchors_preset=15\nanchor_right=1.0\nanchor_bottom=1.0\nscript=ExtResource("1")\n')
  await new Promise((resolve, reject) => {
    const child = spawn(godot, ['--path', project, 'res://.embedding-smoke/smoke.tscn'], { stdio: 'inherit' })
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Godot embedding smoke timed out')) }, 60000)
    child.once('error', (error) => { clearTimeout(timeout); reject(error) })
    child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Godot embedding smoke exited ${code}`)) })
  })
  await mkdir(output, { recursive: true })
  for (const file of ['report.json', 'capture.png']) await cp(join(fixture, file), join(output, file))
  process.stdout.write(`Godot embedding evidence: ${output}\n`)
}
finally { await rm(fixture, { recursive: true, force: true }) }
