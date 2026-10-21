import type { CocosCreatorFileBridge } from './creator'
import type { CreatorNativeAudioProcessor } from './creator-audio'
import type { CreatorNativeVideoDecoder } from './creator-video'
import type { CocosHost, CocosHostFileInfo, CocosHostResource, CocosHostResourceKind } from './index'
import { createCocosCreatorHost } from './creator'
import { createCreatorProcessedAudioBridge } from './creator-audio'
import { createCreatorSpriteBlur } from './creator-blur'
import { installCreatorCancellation } from './creator-cancellation'
import { encodeCreatorPng } from './creator-png'
import { createCreatorVideoBridge } from './creator-video'

/** Creator's actual module is injected; this package does not depend on an editor installation. */
export interface CocosCreatorRuntimeOptions {
  cc: Record<string, any>
  rootNode: any
  namespace: string
  projectionEffect?: any
  native?: { fileUtils: any }
  previewFiles?: CocosCreatorFileBridge
  audioProcessor?: CreatorNativeAudioProcessor
  videoDecoder?: CreatorNativeVideoDecoder
}

/** Concrete resources, audio and durable files for generated Creator workspaces. */
export function createCocosCreatorRuntimeHost(options: CocosCreatorRuntimeOptions): CocosHost {
  installCreatorCancellation()
  const { cc, rootNode, namespace } = options
  const blur = createCreatorSpriteBlur(cc, rootNode, options.projectionEffect)
  const fileUtils = options.native?.fileUtils
  const writableRoot = fileUtils ? `${fileUtils.getWritablePath()}${namespace}/` : `${namespace}/`
  const storage = cc.sys.localStorage
  const prefix = `qua-files:${namespace}:`
  let captureSerial = 0
  let captureQueue: Promise<unknown> = Promise.resolve()
  const fontFaces = new Map<string, any>()
  const fontIds = new Map<string, string>()
  const busVolumes = new Map<string, number>()
  const audioSources = new Set<{ bus: string, volume: number, apply: () => void }>()
  const load = (path: string, type?: any) => new Promise<any>((resolve, reject) => {
    cc.resources.load(path.replace(/^assets\/resources\//, '').replace(/\.[^/.]+$/, '') + (type === cc.SpriteFrame ? '/spriteFrame' : ''), type, (error: unknown, asset: any) => error ? reject(error) : resolve(asset))
  })
  const readBytes = async (path: string): Promise<Uint8Array | undefined> => {
    if (fileUtils) {
      if (!fileUtils.isFileExist(path))
        return undefined
      return new Uint8Array(fileUtils.getDataFromFile(path))
    }
    const value = storage.getItem(prefix + path)
    return value === null ? undefined : new Uint8Array(JSON.parse(value))
  }
  const ensureDir = async (path: string) => {
    if (fileUtils && !fileUtils.isDirectoryExist(path) && !fileUtils.createDirectory(path))
      throw new Error(`Cannot create Cocos storage directory: ${path}`)
  }
  const writeBytes = async (path: string, bytes: Uint8Array) => {
    await ensureDir(path.slice(0, path.lastIndexOf('/')))
    if (fileUtils) {
      if (!fileUtils.writeDataToFile(bytes, path))
        throw new Error(`Cannot write Cocos file: ${path}`)
    }
    else {
      storage.setItem(prefix + path, JSON.stringify(Array.from(bytes)))
    }
  }
  const remove = async (path: string) => {
    if (fileUtils) {
      if (fileUtils.isFileExist(path) && !fileUtils.removeFile(path))
        throw new Error(`Cannot remove Cocos file: ${path}`)
    }
    else {
      storage.removeItem(prefix + path)
    }
  }
  const list = async (root: string): Promise<CocosHostFileInfo[]> => {
    const paths: string[] = []
    if (fileUtils) {
      const visited = new Set<string>()
      const walk = (dir: string) => {
        const key = dir.replace(/\/$/, '')
        if (visited.has(key))
          return
        visited.add(key)
        for (const path of fileUtils.listFiles(dir)) {
          // Native fileUtils includes ./ and ../; neither is a child entry.
          if (/\/\.\.?\/?$/.test(path))
            continue
          if (fileUtils.isDirectoryExist(path))
            walk(path)
          else
            paths.push(path)
        }
      }
      if (fileUtils.isDirectoryExist(root))
        walk(root)
    }
    else {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(`${prefix + root.replace(/\/$/, '')}/`))
          paths.push(key.slice(prefix.length))
      }
    }
    return Promise.all(paths.map(async path => ({ path, size: (await readBytes(path))?.byteLength ?? 0 })))
  }
  const createResource = async (kind: CocosHostResourceKind, source: string, id: string): Promise<CocosHostResource> => {
    const type = kind === 'spriteFrame' ? cc.SpriteFrame : kind === 'audio' ? cc.AudioClip : kind === 'video' ? cc.VideoClip : kind === 'font' ? cc.Font : cc.Asset
    const asset = await load(source, type)
    asset.addRef?.()
    return { id, kind, source, native: asset, width: asset.originalSize?.width, height: asset.originalSize?.height, duration: asset.getDuration?.() }
  }
  const containerSize = () => {
    const camera = rootNode.getComponent(cc.Canvas)?.cameraComponent
    const frame = cc.view.getFrameSize?.()
    if (!camera || !frame?.height)
      return cc.view.getVisibleSize()
    const height = camera.orthoHeight * 2
    return { width: height * frame.width / frame.height, height }
  }
  const host = createCocosCreatorHost({
    rootNode,
    cc,
    video: createCreatorVideoBridge(cc, options.videoDecoder && {
      ...options.videoDecoder,
      create: path => options.videoDecoder!.create(fileUtils?.fullPathForFilename?.(path) || path),
    }),
    writableRoot,
    spriteMaterial: options.projectionEffect
      ? (sprite, resource, projection) => {
          const filter = projection.filter ?? projection.composition?.filter
          const light = projection.lighting
          const material = new cc.Material()
          const factors = cc.gfx.BlendFactor
          const modes: Record<string, [number, number]> = { add: [factors.SRC_ALPHA, factors.ONE], multiply: [factors.DST_COLOR, factors.ONE_MINUS_SRC_ALPHA], screen: [factors.SRC_ALPHA, factors.ONE_MINUS_SRC_COLOR] }
          const blend = projection.blendMode && modes[projection.blendMode]
          material.initialize({ effectAsset: options.projectionEffect, defines: { USE_TEXTURE: true, SAMPLE_FROM_RT: resource?.metadata?.renderTexture === true }, ...(blend ? { states: { blendState: { targets: [{ blend: true, blendSrc: blend[0], blendDst: blend[1] }] } } } : {}) })
          const vector = (values: readonly number[], fallback: number, max = 1.5) => new cc.Vec4(...[0, 1, 2].map(i => Math.min(max, Math.max(0, values[i] ?? fallback))), 1)
          material.setProperty('ambient', vector(light?.ambient ?? [], 1))
          material.setProperty('shade', vector(light?.shade?.color ?? [], 1, 1))
          const from = light?.shade?.from ?? [0, 0]
          const to = light?.shade?.to ?? [1, 1]
          material.setProperty('shadeLine', new cc.Vec4(from[0], from[1], to[0], to[1]))
          material.setProperty('tone', new cc.Vec4(filter?.brightness ?? 1, filter?.contrast ?? 1, filter?.saturate ?? 1, filter?.grayscale ?? 0))
          sprite.customMaterial = material
          const disposeBlur = resource && (filter?.blur ?? 0) > 0
            ? blur.project(sprite, resource, filter!.blur!, sprite.getMaterialInstance(0))
            : undefined
          // Nodes are detached before teardown; resetting to a stripped native
          // builtin RT material can fail. A replacement is assigned before disposal.
          return () => {
            disposeBlur?.()
            material.destroy()
          }
        }
      : undefined,
    layout: {
      getContainerSize: containerSize,
      getDevicePixelRatio: () => 1,
      onLayoutChange(listener) {
        let pending = false
        const notify = () => {
          pending = false
          listener()
        }
        const schedule = () => {
          if (pending)
            return
          pending = true
          // Canvas updates its camera during the same resize notification.
          // Measure after all native component listeners have completed.
          cc.director.once(cc.Director.EVENT_AFTER_UPDATE, notify)
        }
        cc.view.on('canvas-resize', schedule)
        cc.view.on('design-resolution-changed', schedule)
        rootNode.on?.('size-changed', schedule)
        return () => {
          cc.view.off('canvas-resize', schedule)
          cc.view.off('design-resolution-changed', schedule)
          rootNode.off?.('size-changed', schedule)
          cc.director.off(cc.Director.EVENT_AFTER_UPDATE, notify)
        }
      },
    },
    files: {
      loadBytes: async (source) => {
        // Creator imports an opaque .binary file as cc.Asset. .bin is reserved
        // for compiled CCON; requesting BufferAsset also filters generic assets
        // out of the resources bundle even when their bytes were imported.
        const asset = await load(source, cc.Asset)
        const bytes = asset.buffer?.() ?? asset.nativeAsset
        if (bytes instanceof ArrayBuffer)
          return new Uint8Array(bytes)
        if (ArrayBuffer.isView(bytes))
          return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        // JSB's generic Asset retains the imported native URL but does not
        // expose nativeAsset. Read the Creator-resolved packaged file instead.
        if (fileUtils && asset.nativeUrl && fileUtils.isFileExist(asset.nativeUrl))
          return new Uint8Array(fileUtils.getDataFromFile(asset.nativeUrl))
        throw new Error(`Creator imported asset is not binary data: ${source}`)
      },
      readBytes,
      writeBytes,
      delete: remove,
      list,
      ensureDir,
      async move(from, to) {
        await ensureDir(to.slice(0, to.lastIndexOf('/')))
        if (fileUtils) {
          if (!fileUtils.renameFile(from, to))
            throw new Error(`Cannot move Cocos file: ${from}`)
        }
        else {
          const bytes = await readBytes(from)
          if (!bytes)
            throw new Error(`Missing Cocos file: ${from}`)
          await writeBytes(to, bytes)
          await remove(from)
        }
      },
      ...(!fileUtils ? options.previewFiles : undefined),
    },
    resources: {
      loadResource: (kind, source, { id }) => createResource(kind, source, id),
      async createResource(kind, data, { id, source }) {
        if (kind === 'custom')
          return { id, kind, native: data }
        if (!source)
          throw new Error(`Cocos ${kind} requires an imported hybrid asset.`)
        return createResource(kind, source, id)
      },
      releaseResource: resource => (resource.native as any)?.decRef?.(),
    },
    audio: createCreatorProcessedAudioBridge({ cc, rootNode, processor: options.audioProcessor, fileUtils }, {
      setBusVolume(bus, volume) {
        busVolumes.set(bus, volume)
        for (const source of audioSources) source.apply()
      },
      async createAudioHandle(resource, { id, loop, volume, bus = 'master' }) {
        const node = new cc.Node(`qua-audio-${id}`)
        rootNode.addChild(node)
        const audio = node.addComponent(cc.AudioSource)
        audio.clip = resource.native
        audio.loop = loop
        const source = { bus, volume, apply: () => {
          const master = busVolumes.get('master') ?? 1
          const gain = bus === 'master' ? 1 : busVolumes.get(bus) ?? 1
          audio.volume = Math.max(0, Math.min(1, source.volume * master * gain))
        } }
        audioSources.add(source)
        source.apply()
        let pendingSeekMs: number | undefined
        let seekTimer: ReturnType<typeof setTimeout> | undefined
        let audioDisposed = false
        let seekAttempts = 0
        const clearSeekTimer = () => {
          if (seekTimer !== undefined)
            clearTimeout(seekTimer)
          seekTimer = undefined
        }
        const applyStartedSeek = () => {
          seekTimer = undefined
          if (audioDisposed || pendingSeekMs === undefined)
            return
          // STARTED can precede the macOS device's asynchronous source creation.
          // A positive device clock confirms that native seeking is available.
          if (fileUtils && audio.currentTime <= 0) {
            if (++seekAttempts >= 120) {
              pendingSeekMs = undefined
              host.runtime.warn?.('Creator native device clock did not start; deferred seek was unavailable.', { id })
              return
            }
            seekTimer = setTimeout(applyStartedSeek, 16)
            return
          }
          audio.currentTime = pendingSeekMs / 1000
          pendingSeekMs = undefined
        }
        const started = () => {
          // Native AudioSource may recreate/reset its device source on resume.
          // Reapply authored/held seek only after the device has started.
          clearSeekTimer()
          seekAttempts = 0
          applyStartedSeek()
        }
        const listeners = new Set<() => void>()
        const ended = () => {
          for (const listener of listeners)
            listener()
        }
        node.on(cc.AudioSource.EventType.ENDED, ended)
        node.on(cc.AudioSource.EventType.STARTED, started)
        return {
          id,
          play: () => audio.play(),
          pause: () => audio.pause(),
          stop: () => {
            clearSeekTimer()
            pendingSeekMs = undefined
            audio.stop()
          },
          setVolume: (value) => {
            source.volume = value
            source.apply()
          },
          setLoop: (value) => {
            audio.loop = value
          },
          seek: (ms) => {
            pendingSeekMs = ms
            audio.currentTime = ms / 1000
          },
          getPosition: () => audio.currentTime * 1000,
          onEnded: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
          dispose: () => {
            audioDisposed = true
            clearSeekTimer()
            pendingSeekMs = undefined
            audioSources.delete(source)
            audio.stop()
            listeners.clear()
            node.off(cc.AudioSource.EventType.ENDED, ended)
            node.off(cc.AudioSource.EventType.STARTED, started)
            node.destroy()
          },
        }
      },
    }),
    fonts: {
      async registerFontFace(resource, face) {
        fontFaces.set(face.family, resource.native)
        fontIds.set(face.id, face.family)
      },
      unregisterFontFace: async (id) => {
        const family = fontIds.get(id)
        if (family)
          fontFaces.delete(family)
        fontIds.delete(id)
      },
      resolveFont: family => fontFaces.get(family.replace(/['"]/g, '').split(',')[0].trim()),
    },
    capture: {
      async captureBackdrop(viewport, captureOptions = {}) {
        const operation = captureQueue.then(async () => {
          await blur.settled()
          // Resize refreshes rebuild scene and UI projections concurrently.
          // Finish a real scene draw before redirecting the camera, so the
          // backdrop cannot capture the cleared intermediate scene.
          await new Promise<void>(resolve => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve))
          const camera = rootNode.getComponent(cc.Canvas)?.cameraComponent
          if (!camera)
            throw new Error('Creator backdrop capture requires the Canvas camera.')
          const size = containerSize()
          const texture = new cc.RenderTexture()
          const downsample = Math.max(1, Math.min(16, captureOptions.downsample ?? 1))
          const width = Math.max(1, Math.round(size.width / downsample))
          const height = Math.max(1, Math.round(size.height / downsample))
          texture.reset({ width, height })
          const previous = camera.targetTexture
          const previousHeight = camera.orthoHeight
          try {
            camera.targetTexture = texture
            camera.orthoHeight = size.height / 2
            await new Promise<void>(resolve => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve))
          }
          catch (error) {
            texture.destroy()
            throw error
          }
          finally {
            camera.targetTexture = previous
            camera.orthoHeight = previousHeight
          }
          const frame = new cc.SpriteFrame()
          frame.texture = texture
          frame.rect = new cc.Rect(viewport.x * width / size.width, viewport.y * height / size.height, viewport.width * width / size.width, viewport.height * height / size.height)
          const resource: CocosHostResource = { id: `creator-backdrop:${++captureSerial}`, kind: 'spriteFrame', native: frame, width: viewport.width, height: viewport.height, metadata: { renderTexture: true } }
          return { resource, dispose: () => {
            frame.destroy()
            texture.destroy()
          } }
        })
        captureQueue = operation.catch(() => {})
        return operation
      },
      async captureNode(_node, captureOptions = {}) {
        const operation = captureQueue.then(async () => {
          const camera = rootNode.getComponent(cc.Canvas)?.cameraComponent
          if (!camera)
            throw new Error('Creator capture requires the workspace Canvas camera.')
          const size = containerSize()
          const scale = Math.min(1, (captureOptions.maxWidth ?? size.width) / size.width, (captureOptions.maxHeight ?? size.height) / size.height)
          const width = Math.max(1, Math.round(size.width * scale))
          const height = Math.max(1, Math.round(size.height * scale))
          const texture = new cc.RenderTexture()
          texture.reset({ width, height })
          const previous = camera.targetTexture
          const previousHeight = camera.orthoHeight
          try {
            camera.targetTexture = texture
            camera.orthoHeight = size.height / 2
            await new Promise<void>(resolve => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve))
            const pixels = texture.readPixels()
            if (!pixels)
              throw new Error('Creator GPU capture returned no pixels.')
            return { bytes: encodeCreatorPng(pixels, width, height, !cc.sys.isNative), mimeType: 'image/png', width, height, capturedAt: Date.now() }
          }
          finally {
            camera.targetTexture = previous
            camera.orthoHeight = previousHeight
            texture.destroy()
          }
        })
        captureQueue = operation.catch(() => {})
        return operation
      },
    },
  })
  return host
}
