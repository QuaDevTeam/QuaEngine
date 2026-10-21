import type { CocosHostResource } from './index'

/** Serialized, renderer-local GPU work. No readback, asset mutation or game state. */
export function createCreatorSpriteBlur(cc: Record<string, any>, rootNode: any, effect: any) {
  let pending: Promise<void> = Promise.resolve()
  return {
    settled: () => pending,
    project(sprite: any, resource: CocosHostResource, radius: number, displayMaterial: any): () => void {
      let cancelled = false
      let cancelDraw: (() => void) | undefined
      const retained = resource.native as any
      retained.addRef?.()
      let output: any
      let outputFrame: any
      const run = async () => {
        if (cancelled)
          return
        const source = sprite.spriteFrame
        const logical = sprite.node.getComponent(cc.UITransform)
        let width = Math.max(1, Math.round(source.rect.width))
        let height = Math.max(1, Math.round(source.rect.height))
        let sigmaX = radius * width / Math.max(1, logical.width)
        let sigmaY = radius * height / Math.max(1, logical.height)
        // A separate Canvas keeps these quads out of the product UI hierarchy.
        // Only this queue uses its layer; the product camera never sees it.
        const layer = 1 << 19
        const mainCamera = rootNode.getComponent(cc.Canvas)?.cameraComponent
        const visibility = mainCamera?.visibility
        if (mainCamera)
          mainCamera.visibility &= ~layer
        const root = new cc.Node('qua-blur')
        root.layer = layer
        const ui = root.addComponent(cc.UITransform)
        const canvas = root.addComponent(cc.Canvas)
        canvas.alignCanvasWithScreen = false
        const cameraNode = new cc.Node('qua-blur-camera')
        root.addChild(cameraNode)
        cameraNode.setPosition(0, 0, 1000)
        const camera = cameraNode.addComponent(cc.Camera)
        camera.projection = cc.Camera.ProjectionType.ORTHO
        camera.visibility = layer
        camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR
        camera.clearColor = new cc.Color(0, 0, 0, 0)
        camera.priority = -1000
        canvas.cameraComponent = camera
        const node = new cc.Node('qua-blur-quad')
        node.layer = layer
        root.addChild(node)
        const quadUi = node.addComponent(cc.UITransform)
        const quad = node.addComponent(cc.Sprite)
        quad.sizeMode = cc.Sprite.SizeMode.CUSTOM
        cc.director.getScene().addChild(root)
        const textures: any[] = []
        const frames: any[] = []
        const materials: any[] = []
        let input = source
        let renderTexture = resource.metadata?.renderTexture === true
        let premultiply = !renderTexture
        const pass = async (w: number, h: number, dx: number, dy: number, sigma: number) => {
          if (cancelled)
            return
          const texture = new cc.RenderTexture()
          textures.push(texture)
          texture.reset({ width: w, height: h })
          texture.setFilters(cc.Texture2D.Filter.LINEAR, cc.Texture2D.Filter.LINEAR)
          const material = new cc.Material()
          materials.push(material)
          material.initialize({ effectAsset: effect, defines: { USE_TEXTURE: true, SAMPLE_FROM_RT: renderTexture }, states: { blendState: { targets: [{ blend: false }] } } })
          material.setProperty('blurStep', new cc.Vec4(dx / input.texture.width, dy / input.texture.height, 0, 0))
          material.setProperty('blurInfo', new cc.Vec4(sigma, premultiply ? 1 : 0, 0, 0))
          const rect = input.rect
          material.setProperty('blurBounds', new cc.Vec4((rect.x + 0.5) / input.texture.width, (rect.y + 0.5) / input.texture.height, (rect.x + rect.width - 0.5) / input.texture.width, (rect.y + rect.height - 0.5) / input.texture.height))
          quad.customMaterial = material
          quad.spriteFrame = input
          ui.setContentSize(w, h)
          quadUi.setContentSize(w, h)
          camera.targetTexture = texture
          camera.orthoHeight = h / 2
          await new Promise<void>((resolve) => {
            const finish = () => {
              cancelDraw = undefined
              resolve()
            }
            cancelDraw = () => {
              cc.director.off(cc.Director.EVENT_AFTER_DRAW, finish)
              finish()
            }
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, finish)
          })
          if (cancelled)
            return
          const frame = new cc.SpriteFrame()
          frame.texture = texture
          frames.push(frame)
          input = frame
          renderTexture = true
          premultiply = false
        }
        try {
          while (Math.max(sigmaX, sigmaY) > 8 && (width > 1 || height > 1)) {
            if (cancelled)
              break
            const w = Math.max(1, Math.ceil(width / 2))
            const h = Math.max(1, Math.ceil(height / 2))
            await pass(w, h, 0, 0, 0)
            sigmaX *= w / width
            sigmaY *= h / height
            width = w
            height = h
          }
          await pass(width, height, 1, 0, sigmaX)
          await pass(width, height, 0, 1, sigmaY)
          if (!cancelled) {
            output = textures.pop()
            outputFrame = frames.pop()
            displayMaterial.recompileShaders({ USE_TEXTURE: true, SAMPLE_FROM_RT: true })
            displayMaterial.setProperty('blurInfo', new cc.Vec4(0, 0, 1, 0))
            sprite.spriteFrame = outputFrame
            logical.setContentSize(logical.width, logical.height)
          }
        }
        finally {
          camera.targetTexture = null
          root.active = false
          root.destroy()
          for (const frame of frames) frame.destroy()
          for (const texture of textures) texture.destroy()
          for (const material of materials) material.destroy()
          if (mainCamera)
            mainCamera.visibility = visibility
        }
      }
      pending = pending.then(run).catch((error) => {
        if (!cancelled)
          console.warn('[QuaEngine] Creator blur failed:', error)
      // The source's owning resource lease controls destruction. Captured
      // SpriteFrames can start at refCount 0 and must survive a failed pass.
      }).finally(() => retained.decRef?.(false))
      return () => {
        if (cancelled)
          return
        cancelled = true
        cancelDraw?.()
        outputFrame?.destroy()
        output?.destroy()
      }
    },
  }
}
