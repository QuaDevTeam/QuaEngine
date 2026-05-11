import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { emitRenderToLogic, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  emitStoryEventWithEngine,
  enterStoryPointWithEngine,
  getStoryGraphProjection,
  jumpToStoryPointWithEngine,
  registerStoryGraphWithEngine,
  setStoryMetadataWithEngine,
  StoryGraphPlugin,
  unlockStoryNodeWithEngine,
} from '../src'

describe('@quajs/story-graph', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('stores DAG graph data and multi-lane cursors without owning engine navigation', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()

    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      lanes: [
        { id: 'juro', kind: 'protagonist' },
        { id: 'natsuno', kind: 'protagonist' },
      ],
      nodes: [
        { id: 'juro-1', point: { storyId: 'main', protagonistId: 'juro', laneId: 'juro', timelineId: '1985', stepId: 'juro-1' } },
        { id: 'natsuno-1', point: { storyId: 'main', protagonistId: 'natsuno', laneId: 'natsuno', timelineId: '1985', stepId: 'natsuno-1' } },
      ],
      edges: [
        { id: 'shared-event', from: 'juro-1', to: 'natsuno-1', kind: 'event', event: 'sentinel-seen' },
      ],
    })

    await enterStoryPointWithEngine(engine, { storyId: 'main', protagonistId: 'juro', laneId: 'juro', timelineId: '1985', stepId: 'juro-1' }, { cursorId: 'juro' })
    await enterStoryPointWithEngine(engine, { storyId: 'main', protagonistId: 'natsuno', laneId: 'natsuno', timelineId: '1985', stepId: 'natsuno-1' }, { cursorId: 'natsuno' })
    await emitStoryEventWithEngine(engine, 'sentinel-seen', { from: 'juro' })
    await unlockStoryNodeWithEngine(engine, 'natsuno-1')

    const projection = getStoryGraphProjection(engine)
    expect(projection.graphs.main.edges?.[0]).toMatchObject({ kind: 'event', event: 'sentinel-seen' })
    expect(Object.keys(projection.cursors).sort()).toEqual(['juro', 'natsuno'])
    expect(projection.events[0]).toMatchObject({ type: 'sentinel-seen' })
    expect(projection.unlockedNodes).toEqual(['natsuno-1'])
  })

  it('delegates point jumps to engine jump transactions', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'step-1' })
    await engine.createCheckpoint({ id: 'step-1', kind: 'manual' })
    await engine.setStoryPoint({ chapterId: 'chapter-1', stepId: 'step-2' })

    await jumpToStoryPointWithEngine(engine, { chapterId: 'chapter-1', stepId: 'step-1' }, { cursorId: 'main' })

    expect(engine.getStoryPoint()).toEqual({ chapterId: 'chapter-1', stepId: 'step-1' })
    expect(getStoryGraphProjection(engine).cursors.main.point).toEqual({ chapterId: 'chapter-1', stepId: 'step-1' })
  })

  it('tracks the configured default cursor from engine step starts', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin({ defaultCursorId: 'active' }))
    await engine.init()

    await engine.dialogue([{
      uuid: 'step-1',
      metadata: {
        point: {
          storyId: 'main',
          chapterId: 'chapter-1',
          protagonistId: 'juro',
          laneId: 'juro',
        },
      },
      run() {},
    }])

    expect(getStoryGraphProjection(engine).cursors.active.point).toEqual({
      storyId: 'main',
      chapterId: 'chapter-1',
      protagonistId: 'juro',
      laneId: 'juro',
      stepId: 'step-1',
    })
  })

  it('stores story metadata decorator payloads on implicit graph nodes', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await engine.setStoryPoint({ storyId: 'main', stepId: 'step-1' })

    await setStoryMetadataWithEngine(engine, {
      nodeId: 'node-1',
      chapterId: 'chapter-1',
      metadata: { title: 'Opening', locked: false },
    })

    expect(getStoryGraphProjection(engine).graphs.main.nodes[0]).toMatchObject({
      id: 'node-1',
      point: { storyId: 'main', nodeId: 'node-1', chapterId: 'chapter-1', stepId: 'step-1' },
      metadata: { title: 'Opening', locked: false },
    })
  })

  it('records choice targets as graph edges from engine-owned choice projection', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await engine.setStoryPoint({ storyId: 'main', chapterId: 'chapter-1', nodeId: 'start', stepId: 'start' })
    await engine.showChoices([{
      id: 'outside',
      text: 'Go outside',
      metadata: {
        target: 'outside',
        storyGraph: {
          edge: {
            kind: 'choice',
            to: 'outside',
          },
        },
      },
    }, {
      id: 'home',
      text: 'Stay home',
      metadata: {
        target: 'home',
        storyGraph: {
          edge: {
            kind: 'choice',
            to: 'home',
          },
        },
      },
    }])

    expect(getStoryGraphProjection(engine).graphs.main.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'choice', from: 'start', to: 'outside' }),
      expect.objectContaining({ kind: 'choice', from: 'start', to: 'home' }),
    ]))

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: 'outside' })

    const edges = getStoryGraphProjection(engine).graphs.main.edges || []
    expect(edges.filter(edge => edge.kind === 'choice')).toHaveLength(2)
    expect(edges.find(edge => edge.to === 'outside')).toMatchObject({
      metadata: { choiceId: 'outside', text: 'Go outside' },
    })
  })
})

function createEngine(): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
    },
  })
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'story-graph-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
