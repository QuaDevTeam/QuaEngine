import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

// Procedural test media; no third-party content or source-repository URLs.
const root = resolve(import.meta.dirname, '../assets')
for (const domain of ['audio', 'video', 'images']) await mkdir(resolve(root, domain, 'qa-media'), { recursive: true })
for (const [name, frequency, duration] of [['tone-a', 440, 3], ['tone-b', 660, 3], ['cue', 880, 0.6]]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=44100:duration=${duration}`, '-c:a', 'pcm_s16le', resolve(root, `audio/qa-media/${name}.wav`)])
}
// testsrc2 starts in BT.601. Convert the samples as well as declaring tags;
// untagged H.264 is interpreted differently by Chromium and AVFoundation.
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-an', '-vf', 'colorspace=iall=bt601-6-625:all=bt709', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', resolve(root, 'video/qa-media/motion.mp4')])
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolve(root, 'video/qa-media/motion.mp4'), '-frames:v', '1', resolve(root, 'images/qa-media/poster.png')])
await sharp({ create: { width: 240, height: 160, channels: 4, background: '#ee783cff' } }).composite([{ input: Buffer.from('<svg width="240" height="160"><rect x="12" y="12" width="216" height="136" fill="none" stroke="white" stroke-width="8"/><circle cx="70" cy="80" r="28" fill="#29453f"/><path d="M140 50L190 80L140 110Z" fill="white"/></svg>') }]).png().toFile(resolve(root, 'images/qa-media/card.png'))
await writeFile(resolve(root, 'qa-media-fixtures.json'), `${JSON.stringify({ generator: 'scripts/generate-media-fixtures.mjs', audio: { sampleRate: 44100, channels: 1, encoding: 'PCM s16le', toneDurationMs: 3000, cueDurationMs: 600 }, video: { width: 640, height: 360, fps: 24, durationMs: 3000, codec: 'H.264', colorSpace: 'BT.709', colorRange: 'limited', audio: false }, rights: 'Procedural test signal and graphics generated locally; no third-party content.' }, null, 2)}\n`)
