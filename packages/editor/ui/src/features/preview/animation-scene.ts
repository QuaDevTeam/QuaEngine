import type {
  EditorAnimationScenePreview,
  EditorBridge,
  EditorProject,
} from '@quajs/editor-core'

/** Reuses the one project Web session and its real renderer, assets and styles. */
export class AnimationScenePreviewHost {
  surface?: HTMLElement
  private owner?: symbol
  private queue: Promise<unknown> = Promise.resolve()
  private readonly observer = new ResizeObserver(() => this.changed())

  constructor(
    private readonly bridge: EditorBridge,
    private readonly project: () => EditorProject | undefined,
    private readonly saveAll: () => Promise<void>,
    private readonly changed: () => void,
  ) {}

  create(): EditorAnimationScenePreview {
    const owner = Symbol('animation-preview')
    let sessionId: string | undefined
    let root: string | undefined
    let generation = 0
    let requested = false
    const current = (epoch: number) => {
      if (
        !requested
        || epoch !== generation
        || this.owner !== owner
        || this.project()?.root !== root
      ) {
        throw new Error('动画场景预览已切换。')
      }
    }
    const detach = () => {
      if (this.owner !== owner)
        return
      this.observer.disconnect()
      this.surface = undefined
      this.changed()
    }
    return {
      open: async (projectRoot, scene) => {
        root = projectRoot
        requested = true
        this.owner = owner
        const epoch = ++generation
        return this.serial(async () => {
          current(epoch)
          await this.saveAll()
          current(epoch)
          let state = await this.bridge.previewState()
          if (state.phase !== 'running' || state.identity?.target !== 'web') {
            await this.bridge.startPreview('web')
            current(epoch)
            state = await this.bridge.previewState()
          }
          if (
            state.phase !== 'running'
            || !state.identity
            || state.identity.target !== 'web'
          ) {
            throw new Error(state.error ?? 'Web 场景预览未启动。')
          }
          sessionId = state.identity.sessionId
          await this.bridge.presentPreview('embedded')
          current(epoch)
          const result = await this.bridge.previewCommand(sessionId, {
            action: 'seek',
            ...scene,
          })
          current(epoch)
          if (
            result.path !== scene.path
            || result.stepIndex !== scene.stepIndex
          ) {
            throw new Error(result.message || '场景定位遇到选择分支。')
          }
          const ready = await this.bridge.previewCommand(sessionId, {
            action: 'animation-scene',
          })
          current(epoch)
          if (!ready.animationScene) {
            throw new Error(
              '项目需要更新 @quajs/editor-core/runtime 才能预览动画场景。',
            )
          }
          return ready.animationScene
        })
      },
      attach: (surface) => {
        if (this.owner !== owner)
          return
        this.observer.disconnect()
        this.surface = surface
        if (surface)
          this.observer.observe(surface)
        this.changed()
      },
      sample: (sample) => {
        const epoch = generation
        return this.serial(async () => {
          current(epoch)
          if (!sessionId)
            throw new Error('请先选择预览场景。')
          await this.bridge.previewCommand(sessionId, {
            action: 'animation-sample',
            sample,
          })
          current(epoch)
        })
      },
      release: () => {
        const owned = this.owner === owner
        requested = false
        ++generation
        detach()
        const previous = sessionId
        sessionId = undefined
        if (this.owner === owner)
          this.owner = undefined
        if (previous && owned) {
          void this.serial(async () => {
            const state = await this.bridge.previewState()
            if (
              state.phase === 'running'
              && !state.reloading
              && state.identity?.sessionId === previous
            ) {
              await this.bridge.previewCommand(previous, {
                action: 'animation-release',
              })
            }
          }).catch(() => {})
        }
      },
    }
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(task)
    this.queue = next
    return next
  }
}
