import { createCharacter, clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { QuaEngine } from '@quajs/engine'
import { createNativeRendererJsonFrameInput, type NativeRendererEngineViewProjection } from '@quajs/engine-native'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemoEngineRuntime } from '../../game/runtime-shared'

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const DEFAULT_FRAME_PATH = resolve(DEMO_ROOT, 'dist/native/dev/frame.json')

export async function createDemoNativeFrame(outputPath = DEFAULT_FRAME_PATH): Promise<string> {
  QuaEngine.resetInstance()
  const runtime = await createDemoEngineRuntime({
    engine: {
      project: {
        name: 'Broken Link Era Demo',
        bundleId: 'dev.quajs.demo.brokenlinkera',
        version: '0.1.0',
      },
      layout: 'landscape',
      assets: {
        adapter: createMemoryAssetsAdapter(),
        locale: 'default',
        enableCache: false,
      },
      flowControl: {
        skipMode: 'all',
      },
      dialogue: {
        typewriter: {
          enabled: false,
        },
      },
    },
    systemLocale: 'zh-cn',
  })

  configureCharacterRuntime({ engine: runtime.engine, waitForAdvance: false })
  try {
    await runtime.background.setBackground('backgrounds/blackout-city.jpg', {
      fit: 'cover',
      opacity: 0.92,
    })

    const lin = createCharacter('lin', {
      displayName: 'Lin',
      sprite: 'lin/focus.png',
      position: { x: 520, y: 650, scale: 1 },
      layer: 2,
    })
    const mara = createCharacter('mara', {
      displayName: 'Mara',
      sprite: 'mara/alert.png',
      position: { x: 1260, y: 650, scale: 1 },
      layer: 3,
    })
    await lin.show()
    await mara.show()
    await lin.speak('The Tokyo uplink is down. Mara, confirm the last human signal.', { wait: false })
    await runtime.engine.showChoices([
      { id: 'trace', text: 'TRACE SIGNAL', enabled: true },
      { id: 'hold', text: 'HOLD SILENCE', enabled: true },
    ])
    await runtime.animation.playTimeline({
      id: 'demo.native.mara-breathe',
      duration: 1800,
      loop: true,
      tracks: [{
        target: 'character:mara',
        property: 'position.y',
        keyframes: [
          { at: 0, value: 650 },
          { at: 900, value: 638, easing: 'ease-in-out' },
          { at: 1800, value: 650, easing: 'ease-in-out' },
        ],
      }, {
        target: 'character:mara',
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0.9 },
          { at: 900, value: 1 },
          { at: 1800, value: 0.9 },
        ],
      }],
    }, { wait: false })
    await runtime.engine.showUI('native-dev-status', createNativeDevSurface())

    const view = runtime.engine.getViewState()
    const animationStartedAt = view.animations[0]?.startedAt ?? Date.now()
    const frame = createNativeRendererJsonFrameInput(view as unknown as NativeRendererEngineViewProjection, {
      now: animationStartedAt + 900,
    })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(frame, null, 2)}\n`, 'utf8')
    return outputPath
  }
  finally {
    clearCharacterRuntime()
    await runtime.engine.destroy()
    QuaEngine.resetInstance()
  }
}

function createNativeDevSurface(): Record<string, unknown> {
  return {
    visible: true,
    interactive: true,
    zIndex: 90,
    surface: {
      key: 'demo/native-dev-status.qui',
      root: {
        id: 'native-dev-status',
        kind: 'Panel',
        bounds: { x: 42, y: 34, width: 520, height: 174 },
        visible: true,
        style: {
          backgroundColor: '#0a111bcc',
          borderColor: '#71d7f3',
          borderWidth: 2,
          borderRadius: 6,
          padding: { top: 18, right: 20, bottom: 18, left: 20 },
        },
        children: [{
          id: 'native-dev-title',
          kind: 'Text',
          bounds: { x: 68, y: 58, width: 450, height: 46 },
          visible: true,
          text: 'BROKEN LINK ERA / NATIVE',
          style: {
            color: '#f8e9bd',
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 38,
          },
        }, {
          id: 'native-dev-detail',
          kind: 'Text',
          bounds: { x: 68, y: 112, width: 450, height: 34 },
          visible: true,
          text: 'QuaEngine + Character + Animation + QUI',
          style: {
            color: '#9ddff0',
            fontSize: 18,
            lineHeight: 26,
          },
        }, {
          id: 'native-dev-settings',
          kind: 'Button',
          bounds: { x: 362, y: 152, width: 156, height: 42 },
          visible: true,
          text: 'SETTINGS',
          intent: {
            event: 'ui/intent',
            action: 'open',
            metadata: { panel: 'settings', source: 'native-demo' },
          },
          style: {
            backgroundColor: '#d6ad55',
            color: '#17130b',
            fontSize: 16,
            fontWeight: 700,
          },
        }],
      },
    },
  }
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
