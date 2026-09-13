import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'
import {
  backgroundProjectionVars, projectBackground, projectCharacters, projectChoices,
  projectDialogue, projectStageMotion, resolveUiChoiceSkinReference,
} from '../../packages/render/web/dist/index.js'
import { dbToGain } from '../../packages/plugins/audio/dist/contracts.js'
import { resolveSpriteProjection } from '../../packages/plugins/sprite/dist/contracts.js'

const output = fileURLToPath(new URL('../../packages/native/target/render-audit/', import.meta.url))
mkdirSync(output, { recursive: true })
const results = []
const native = view => createNativeRendererViewProjection({ plugins: {}, ...view }, { now: 1500 })
const record = (id, input, web, actual) => results.push({ id, input, web, native: actual ?? null })
const bg = { mode: 'image', assetName: 'backgrounds/morning-city.jpg', assetType: 'images' }
for (const [id, composition] of [
  ['background-filter', { filter: { brightness: 0.5, blur: 8 } }],
  ['background-blend', { blendMode: 'multiply', isolation: true }],
  ['background-mask', { mask: { assetName: 'mask.png', mode: 'alpha', size: 'cover' } }],
]) {
  const input = { ...bg, composition }
  record(id, input, backgroundProjectionVars(input), native({ background: input }).background)
}
for (const gainDb of [-6, 0, 6]) {
  const track = { id: 'music', assetKey: 'music.ogg', gainDb, state: 'playing' }
  record(`audio-gain-${gainDb}`, track, { linearGain: dbToGain(gainDb) }, native({ plugins: { audio: { bgm: track } } }).audio)
}
const audio = { id: 'music', assetKey: 'music.ogg', state: 'playing',
  eq: [{ type: 'peaking', frequency: 1000, gainDb: 6, q: 1 }],
  automation: [{ propertyPath: 'gainDb', keyframes: [{ at: 0, value: -12 }, { at: 1000, value: 0 }] }],
  seekMs: 100, fadeInMs: 250, fadeOutMs: 300, delayMs: 50, loop: true }
record('audio-eq-automation-timing', audio, audio, native({ plugins: { audio: { bgm: audio } } }).audio)
const rich = { blocks: [{ spans: [{ text: 'RED', color: '#ff0000', fontStyle: 'italic', textDecoration: 'underline' },
  { text: ' green', color: '#00ff00', fontSize: 36 }] }], fontFamily: ['Noto Sans'], fontSize: 26 }
record('rich-text-span-style', rich, projectDialogue({ text: rich }, [], 1500), native({ dialogue: { text: rich } }).dialogue)
const animation = (target, property, from, to) => ({ id: `${target}-${property}`, state: 'running',
  startedAt: 1000, duration: 1000, playbackRate: 1, resolvedTracks: [{ target, property,
    keyframes: [{ at: 0, value: from }, { at: 1000, value: to, easing: 'linear' }] }] })
for (const [id, view, web] of [
  ['background-animation', { background: bg, animations: [animation('background:main', 'scale', 1, 2)] },
    v => projectBackground(v.background, v.animations, 1500)],
  ['character-animation', { characters: [{ id: 'mira', name: 'Mira', sprite: 'mira/base.png', position: { x: 0, y: 600 } }],
    animations: [animation('character:mira', 'position.x', 0, 200)] }, v => projectCharacters(v.characters, v.animations, 1500)],
  ['dialogue-animation', { dialogue: { text: 'Hello' }, animations: [animation('dialogue:box', 'opacity', 0, 1)] },
    v => projectDialogue(v.dialogue, v.animations, 1500)],
  ['choices-animation', { choices: [{ id: 'one', text: 'One' }], animations: [animation('choices:panel', 'opacity', 0, 1)] },
    v => projectChoices(v.choices, v.animations, 1500)],
  ['stage-camera-animation', { plugins: { stage: { x: 10 }, camera: { scale: 1.2 } },
    animations: [animation('stage:main', 'x', 10, 110)] }, v => projectStageMotion(v, 1500)],
]) record(id, view, web(view), native(view))
const skinView = { plugins: { ui: { themeId: 'neon', defaults: { button: 'pill' } } },
  choices: [{ id: 'one', text: 'One', presentation: { skinId: 'special' } }] }
record('ui-skin', skinView, resolveUiChoiceSkinReference(skinView, skinView.choices[0]), native(skinView))
const sprite = { id: 'mira', name: 'Mira', sprite: 'mira/base.png', expression: 'happy' }
const manifest = { version: 1, family: 'mira', base: { asset: 'base.png' },
  expressions: { happy: { layers: [{ asset: 'happy.png', offsetX: 10, offsetY: 20 }] } } }
record('sprite-expression', { sprite, manifest }, resolveSpriteProjection(manifest, sprite.sprite, sprite.expression), native({ characters: [sprite] }))
const provenance = { ...bg, contentPackageId: 'runtime.a', requiredRuntimePackages: ['runtime.b'] }
record('background-provenance', provenance, projectBackground(provenance, [], 1500), native({ background: provenance }).background)
writeFileSync(`${output}/bridge.json`, JSON.stringify({ method: 'Actual Web projection APIs versus native TS bridge, without GPU or audio-output claims', results }, null, 2))
console.log(`Recorded ${results.length} projection probes: ${output}/bridge.json`)
