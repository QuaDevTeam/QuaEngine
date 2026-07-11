import type { NativeRendererIntent } from '@quajs/native-contracts'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemoNativeSession } from './session'

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const DEFAULT_FRAME_PATH = resolve(DEMO_ROOT, 'dist/native/dev/frame.json')

export async function createDemoNativeFrame(
  outputPath = DEFAULT_FRAME_PATH,
  fixture = process.env.QUA_NATIVE_DEMO_PANEL,
): Promise<string> {
  const session = await createDemoNativeSession(fixture)
  try {
    await writeFrameAtomically(outputPath, session.renderFrame())
    return outputPath
  }
  finally {
    await session.destroy()
  }
}

export async function createDemoNativeController(
  outputPath = DEFAULT_FRAME_PATH,
  fixture = process.env.QUA_NATIVE_DEMO_PANEL,
) {
  const session = await createDemoNativeSession(fixture)
  await writeFrameAtomically(outputPath, session.renderFrame())
  return {
    async dispatchIntent(intent: NativeRendererIntent) {
      await session.dispatchIntent(intent)
      await writeFrameAtomically(outputPath, session.renderFrame())
    },
    async destroy() {
      await session.destroy()
    },
  }
}

async function writeFrameAtomically(outputPath: string, frame: unknown): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(frame, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, outputPath)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_FRAME_PATH
  createDemoNativeFrame(outputPath)
    .then(path => console.log(`Native demo frame written: ${path}`))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
