import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readQpkBundle } from '@quajs/quack/qpk-reader'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = join(demo, 'dist/godot/workspace')
const fixture = join(project, '.native-smoke')
const output = join(demo, '.generated/godot-native-smoke')
const godot = process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot')
await mkdir(fixture, { recursive: true })
try {
  const qpk = (await readdir(join(project, 'qua'))).find(file => file.endsWith('.qpk'))
  if (!qpk)
    throw new Error('Run build:godot first')
  const { assets } = await readQpkBundle(join(project, 'qua', qpk))
  for (const [source, target] of [['fonts/NotoSansCJKsc-Regular.otf', 'font.otf'], ['audio/qa-media/tone-a.wav', 'tone.wav'], ['video/qa-media/motion.mp4', 'video.ogv']]) {
    const bytes = assets.get(`assets/${source}`)
    if (!bytes)
      throw new Error(`QPK is missing ${source}`)
    await writeFile(join(fixture, target), bytes)
  }
  await cp(join(demo, '../packages/platform/godot-host/test/native-smoke.gd'), join(fixture, 'smoke.gd'))
  await writeFile(join(fixture, 'smoke.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://.native-smoke/smoke.gd" id="1"]\n[node name="NativeSmoke" type="Control"]\nlayout_mode=3\nanchors_preset=15\nanchor_right=1.0\nanchor_bottom=1.0\nscript=ExtResource("1")\n')
  await new Promise((resolve, reject) => {
    const child = spawn(godot, ['--path', project, 'res://.native-smoke/smoke.tscn'], { stdio: 'inherit' })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Godot native smoke timed out'))
    }, 30000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      code === 0 ? resolve() : reject(new Error(`Godot smoke exited ${code}`))
    })
  })
  await mkdir(output, { recursive: true })
  for (const file of ['report.json', 'capture.png']) await cp(join(fixture, file), join(output, file))
  process.stdout.write(`Native Godot evidence: ${output}\n`)
}
finally { await rm(fixture, { recursive: true, force: true }) }
