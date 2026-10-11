import type { CocosCreatorVideoBridge } from './creator'
import type { CocosHostSpriteOptions } from './index'

export interface CreatorNativeVideoDecoder {
  create: (path: string) => number
  project: (id: number, loop: boolean, muted: boolean, volume: number, rate: number, seekMs: number) => void
  frame: (id: number) => { positionMs: number, durationMs: number, rate: number, ready: number, error: number, pixels?: ArrayBuffer, width?: number, height?: number, frameMs?: number }
  dispose: (id: number) => void
}

/** SDK VideoPlayer for its supported targets; AVFoundation frames on macOS. */
export function createCreatorVideoBridge(cc: Record<string, any>, decoder?: CreatorNativeVideoDecoder): CocosCreatorVideoBridge | undefined {
  if (!decoder && (cc.sys.isNative || !cc.VideoPlayer))
    return undefined
  const handles = new Map<any, { resource: unknown, signature?: string, update: (options: CocosHostSpriteOptions) => void, dispose: () => void }>()
  return {
    project(node, resource, options) {
      let handle = handles.get(node)
      if (handle && handle.resource !== resource.native) {
        handle.dispose()
        handles.delete(node)
        handle = undefined
      }
      if (!handle) {
        if (decoder) {
          const id = decoder.create((resource.native as any).nativeUrl)
          if (!id)
            throw new Error('Creator native video decoder could not open imported resource.')
          const texture = new cc.Texture2D()
          const spriteFrame = new cc.SpriteFrame()
          const sprite = node.addComponent(cc.Sprite)
          sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM
          let size = ''
          let stopped = false
          const updateFrame = () => {
            if (stopped)
              return
            const frame = decoder.frame(id)
            node.__quaVideo = { ...frame, frameMs: frame.frameMs ?? node.__quaVideo?.frameMs, pixels: undefined, backend: 'avfoundation', decodedFrames: (node.__quaVideo?.decodedFrames ?? 0) + (frame.pixels ? 1 : 0) }
            if (frame.error) {
              stopped = true
              throw new Error('Creator AVFoundation video decoding failed.')
            }
            if (frame.pixels && frame.width && frame.height) {
              const nextSize = `${frame.width}x${frame.height}`
              if (size !== nextSize) {
                texture.reset({ width: frame.width, height: frame.height, format: cc.Texture2D.PixelFormat.RGBA8888 })
                spriteFrame.texture = texture
                sprite.spriteFrame = spriteFrame
                size = nextSize
              }
              texture.uploadData(new Uint8Array(frame.pixels))
            }
          }
          cc.director.on(cc.Director.EVENT_BEFORE_DRAW, updateFrame)
          handle = { resource: resource.native, update: (projection) => {
            const video = projection.video ?? {}
            decoder.project(id, video.loop ?? true, video.muted ?? true, video.volume ?? 1, video.playbackRate ?? 1, video.seekMs ?? video.offsetMs ?? 0)
          }, dispose: () => {
            stopped = true
            cc.director.off(cc.Director.EVENT_BEFORE_DRAW, updateFrame)
            decoder.dispose(id)
            sprite.spriteFrame = null
            sprite.destroy()
            spriteFrame.destroy()
            texture.destroy()
            delete node.__quaVideo
          } }
        }
        else {
          const player = node.addComponent(cc.VideoPlayer)
          player.playOnAwake = false
          player.keepAspectRatio = false
          player.stayOnBottom = true
          player.resourceType = cc.VideoPlayer.ResourceType.LOCAL
          let seekMs = -1
          let ready = false
          const started = () => {
            ready = true
            player.currentTime = Math.max(0, seekMs) / 1000
            player.play()
          }
          node.on(cc.VideoPlayer.EventType.READY_TO_PLAY, started)
          handle = { resource: resource.native, update: (projection) => {
            const video = projection.video ?? {}
            player.loop = video.loop ?? true
            player.mute = video.muted ?? true
            player.volume = video.volume ?? 1
            player.playbackRate = video.playbackRate ?? 1
            const seek = video.seekMs ?? video.offsetMs ?? 0
            if (seekMs !== seek) {
              seekMs = seek
              if (ready)
                player.currentTime = seek / 1000
            }
          }, dispose: () => {
            node.off(cc.VideoPlayer.EventType.READY_TO_PLAY, started)
            player.stop()
            player.destroy()
          } }
          // Install controls/listeners before an already cached clip becomes ready.
          handle.update(options)
          player.clip = resource.native
        }
        handles.set(node, handle)
      }
      const signature = JSON.stringify(options.video ?? {})
      if (handle.signature !== signature) {
        handle.update(options)
        handle.signature = signature
      }
    },
    dispose(node) {
      handles.get(node)?.dispose()
      handles.delete(node)
    },
  }
}
