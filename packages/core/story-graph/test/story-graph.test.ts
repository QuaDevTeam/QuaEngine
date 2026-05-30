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
  registerStoryGraphDeltaWithEngine,
  registerStoryGraphWithEngine,
  removeRuntimePackageStoryGraphContentWithEngine,
  resolveStoryTargetFromGraphWithEngine,
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

  it('resets lower-level story metadata when scene and entry markers change', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await engine.setStoryPoint({
      storyId: 'main',
      sceneId: 'library',
      entryId: 'intro',
      nodeId: 'library.enter',
      labelId: 'old-label',
      stepId: 'step-1',
    } as any)

    await setStoryMetadataWithEngine(engine, { sceneId: 'dorm' } as any)

    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      storyId: 'main',
      sceneId: 'dorm',
      stepId: 'step-1',
    }))
    expect(engine.getStoryPoint()).not.toEqual(expect.objectContaining({
      entryId: 'intro',
      nodeId: 'library.enter',
      labelId: 'old-label',
    }))

    await setStoryMetadataWithEngine(engine, { entryId: 'nightReturn' } as any)

    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      sceneId: 'dorm',
      entryId: 'nightReturn',
      stepId: 'step-1',
    }))
    expect(engine.getStoryPoint()).not.toEqual(expect.objectContaining({
      nodeId: 'library.enter',
      labelId: 'old-label',
    }))
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

  it('resolves structured node targets from active graph projection', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{
        id: 'library',
        point: {
          storyId: 'main',
          sceneId: 'school',
          nodeId: 'library',
          stepId: 'library-step',
          scriptModuleId: 'main.school',
          contentPackageId: 'runtime.school',
        } as any,
        presentation: {
          thumbnail: { type: 'images', name: 'story/library.png' },
        },
      }],
    })

    const resolved = await resolveStoryTargetFromGraphWithEngine({ kind: 'node', id: 'library' }, {
      engine,
      target: { kind: 'node', id: 'library' },
      currentPoint: { storyId: 'main', sceneId: 'school', stepId: 'start' },
    })

    expect(resolved?.point).toEqual(expect.objectContaining({ nodeId: 'library', stepId: 'library-step' }))
    expect(resolved?.script).toEqual(expect.objectContaining({ moduleId: 'main.school', nodeId: 'library' }))
    expect(resolved?.requiredRuntimePackages).toEqual(['runtime.school'])
  })

  it('merges package-scoped dynamic graph deltas with timeline and lane provenance', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-story',
      graphId: 'main',
      timelines: [
        { id: 'timeline-1985', title: '1985' },
      ],
      lanes: [
        { id: 'juro', kind: 'protagonist', title: 'Juro' },
      ],
      nodes: [
        {
          id: 'runtime-start',
          point: {
            storyId: 'main',
            laneId: 'juro',
            timelineId: 'timeline-1985',
            stepId: 'runtime-step',
            scriptModuleId: 'runtime.story.scene',
          },
          title: 'Runtime Start',
        },
      ],
      edges: [
        { from: 'runtime-start', to: 'runtime-next', kind: 'choice' },
      ],
    }, { packageId: 'runtime.story' })

    const graph = getStoryGraphProjection(engine).graphs.main

    expect(graph.metadata).toEqual(expect.objectContaining({ contentPackageId: 'runtime.story' }))
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'runtime-start',
        point: expect.objectContaining({
          stepId: 'runtime-step',
          contentPackageId: 'runtime.story',
          scriptModuleId: 'runtime.story.scene',
        }),
        metadata: expect.objectContaining({ contentPackageId: 'runtime.story' }),
      }),
    ]))
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'runtime-start',
        to: 'runtime-next',
        metadata: expect.objectContaining({ contentPackageId: 'runtime.story' }),
      }),
    ]))
    expect(graph.lanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'timeline-1985',
        kind: 'timeline',
        metadata: expect.objectContaining({ contentPackageId: 'runtime.story' }),
      }),
      expect.objectContaining({
        id: 'juro',
        kind: 'protagonist',
        metadata: expect.objectContaining({ contentPackageId: 'runtime.story' }),
      }),
    ]))
  })

  it('removes package-scoped graph deltas without deleting base graph content', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      lanes: [{ id: 'base-lane', kind: 'main' }],
      nodes: [{ id: 'base', point: { storyId: 'main', stepId: 'base' } }],
      edges: [],
    })
    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-story',
      graphId: 'main',
      timelines: [{ id: 'runtime-timeline', title: 'Runtime Timeline' }],
      nodes: [
        { id: 'runtime-node', point: { storyId: 'main', stepId: 'runtime-step' } },
      ],
      edges: [
        { from: 'base', to: 'runtime-node', kind: 'choice' },
      ],
    }, { packageId: 'runtime.story' })
    await enterStoryPointWithEngine(engine, { storyId: 'main', stepId: 'runtime-step', contentPackageId: 'runtime.story' })
    await emitStoryEventWithEngine(engine, 'runtime-event')
    await unlockStoryNodeWithEngine(engine, 'runtime-node')

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.story')

    const projection = getStoryGraphProjection(engine)
    expect(projection.graphs.main.nodes).toEqual([
      expect.objectContaining({ id: 'base' }),
    ])
    expect(projection.graphs.main.edges).toEqual([])
    expect(projection.graphs.main.lanes).toEqual([
      expect.objectContaining({ id: 'base-lane' }),
    ])
    expect(projection.graphs.main.metadata?.contentPackageId).toBeUndefined()
    expect(projection.cursors.main).toBeUndefined()
    expect(projection.events).toEqual([])
    expect(projection.unlockedNodes).toEqual([])
  })

  it('restores base graph nodes when a package delta temporarily overlays the same id', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{
        id: 'shared-node',
        title: 'Base Title',
        point: { storyId: 'main', stepId: 'base-step' },
        metadata: { source: 'base' },
      }],
      edges: [],
    })

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:overlay',
      graphId: 'main',
      nodes: [{
        id: 'shared-node',
        title: 'Runtime Title',
        point: { storyId: 'main', stepId: 'runtime-step' },
        metadata: { source: 'runtime' },
      }],
    }, { packageId: 'runtime.story' })

    expect(getStoryGraphProjection(engine).graphs.main.nodes[0]).toEqual(expect.objectContaining({
      id: 'shared-node',
      title: 'Runtime Title',
      point: expect.objectContaining({
        stepId: 'runtime-step',
        contentPackageId: 'runtime.story',
      }),
    }))

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.story')

    expect(getStoryGraphProjection(engine).graphs.main.nodes[0]).toEqual(expect.objectContaining({
      id: 'shared-node',
      title: 'Base Title',
      point: { storyId: 'main', stepId: 'base-step' },
      metadata: { source: 'base' },
    }))
  })

  it('keeps same-scene timeline deltas from other packages when one package unloads', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{ id: 'base', point: { storyId: 'main', sceneId: 'shared-scene', stepId: 'base' } }],
      edges: [],
    })

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-a',
      graphId: 'main',
      timelines: [{ id: 'shared-timeline', title: 'Shared Scene Timeline' }],
      lanes: [{ id: 'hero', kind: 'protagonist' }],
      nodes: [{
        id: 'runtime-a-node',
        point: {
          storyId: 'main',
          sceneId: 'shared-scene',
          timelineId: 'shared-timeline',
          laneId: 'hero',
          stepId: 'runtime-a-step',
        },
      }],
      edges: [{ from: 'base', to: 'runtime-a-node', kind: 'event' }],
    }, { packageId: 'runtime.scene.a' })
    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-b',
      graphId: 'main',
      timelines: [{ id: 'shared-timeline', title: 'Shared Scene Timeline' }],
      lanes: [{ id: 'hero', kind: 'protagonist' }],
      nodes: [{
        id: 'runtime-b-node',
        point: {
          storyId: 'main',
          sceneId: 'shared-scene',
          timelineId: 'shared-timeline',
          laneId: 'hero',
          stepId: 'runtime-b-step',
        },
      }],
      edges: [{ from: 'base', to: 'runtime-b-node', kind: 'event' }],
    }, { packageId: 'runtime.scene.b' })

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.a')

    const graph = getStoryGraphProjection(engine).graphs.main
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'base' }),
      expect.objectContaining({
        id: 'runtime-b-node',
        point: expect.objectContaining({
          sceneId: 'shared-scene',
          timelineId: 'shared-timeline',
          contentPackageId: 'runtime.scene.b',
        }),
      }),
    ]))
    expect(graph.nodes.some(node => node.id === 'runtime-a-node')).toBe(false)
    expect(graph.edges).toEqual([
      expect.objectContaining({ from: 'base', to: 'runtime-b-node' }),
    ])
    expect(graph.lanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'shared-timeline',
        metadata: expect.objectContaining({ contentPackageId: 'runtime.scene.b' }),
      }),
      expect.objectContaining({
        id: 'hero',
        metadata: expect.objectContaining({ contentPackageId: 'runtime.scene.b' }),
      }),
    ]))
  })

  it('replays package graph deltas without leaving implicit nodes or empty graphs', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-a',
      graphId: 'runtime-only',
      nodes: [{ id: 'a-node', point: { storyId: 'runtime-only', stepId: 'a-step' } }],
      edges: [],
    }, { packageId: 'runtime.scene.a' })
    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-b',
      graphId: 'runtime-only',
      nodes: [{ id: 'b-node', point: { storyId: 'runtime-only', stepId: 'b-step' } }],
      edges: [{ from: 'a-node', to: 'b-node', kind: 'event' }],
    }, { packageId: 'runtime.scene.b' })

    expect(getStoryGraphProjection(engine).graphs['runtime-only'].nodes.map(node => node.id).sort()).toEqual([
      'a-node',
      'b-node',
    ])

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.b')
    expect(getStoryGraphProjection(engine).graphs['runtime-only'].nodes).toEqual([
      expect.objectContaining({
        id: 'a-node',
        point: expect.objectContaining({ contentPackageId: 'runtime.scene.a' }),
      }),
    ])
    expect(getStoryGraphProjection(engine).graphs['runtime-only'].edges).toEqual([])

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.a')
    expect(getStoryGraphProjection(engine).graphs['runtime-only']).toBeUndefined()
  })

  it('keeps package deltas shared across package-scoped engine facades', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{ id: 'base', point: { storyId: 'main', stepId: 'base' } }],
      edges: [],
    })

    await engine.withRuntimePackageContext('runtime.scene.a', async (runtimeAEngine) => {
      await registerStoryGraphDeltaWithEngine(runtimeAEngine, {
        id: 'delta:runtime-a',
        graphId: 'main',
        nodes: [{ id: 'a-node', point: { storyId: 'main', stepId: 'a-step' } }],
        edges: [{ from: 'base', to: 'a-node', kind: 'event' }],
      }, { packageId: 'runtime.scene.a' })
    })
    await engine.withRuntimePackageContext('runtime.scene.b', async (runtimeBEngine) => {
      await registerStoryGraphDeltaWithEngine(runtimeBEngine, {
        id: 'delta:runtime-b',
        graphId: 'main',
        nodes: [{ id: 'b-node', point: { storyId: 'main', stepId: 'b-step' } }],
        edges: [{ from: 'a-node', to: 'b-node', kind: 'event' }],
      }, { packageId: 'runtime.scene.b' })
    })

    expect(getStoryGraphProjection(engine).graphs.main.nodes.map(node => node.id).sort()).toEqual([
      'a-node',
      'b-node',
      'base',
    ])

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.a')

    const graph = getStoryGraphProjection(engine).graphs.main
    expect(graph.nodes.map(node => node.id).sort()).toEqual([
      'b-node',
      'base',
    ])
    expect(graph.edges).toEqual([])
  })

  it('removes graph deltas that require an unloaded runtime package without resurrecting them', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{ id: 'base', point: { storyId: 'main', stepId: 'base' } }],
      edges: [],
    })

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-a',
      graphId: 'main',
      metadata: { requiredRuntimePackages: ['runtime.scene.b'] },
      nodes: [{ id: 'a-node', point: { storyId: 'main', stepId: 'a-step' } }],
      edges: [{ from: 'base', to: 'a-node', kind: 'event' }],
      lanes: [{ id: 'a-lane', kind: 'route' }],
    }, { packageId: 'runtime.scene.a' })

    expect(getStoryGraphProjection(engine).graphs.main.nodes.find(node => node.id === 'a-node')?.metadata)
      .toEqual(expect.objectContaining({
        contentPackageId: 'runtime.scene.a',
        requiredRuntimePackages: ['runtime.scene.b'],
      }))

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.b')
    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-c',
      graphId: 'main',
      nodes: [{ id: 'c-node', point: { storyId: 'main', stepId: 'c-step' } }],
    }, { packageId: 'runtime.scene.c' })

    const graph = getStoryGraphProjection(engine).graphs.main
    expect(graph.nodes.map(node => node.id).sort()).toEqual(['base', 'c-node'])
    expect(graph.edges).toEqual([])
    expect(graph.lanes).toEqual([])
  })

  it('tags full graphs registered through package-scoped engine facades', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.graph', async (runtimeEngine) => {
      await registerStoryGraphWithEngine(runtimeEngine, {
        id: 'runtime-main',
        metadata: { requiredRuntimePackages: ['runtime.graph-assets'] },
        lanes: [{ id: 'lane-a', kind: 'timeline' }],
        nodes: [{ id: 'runtime-node', point: { storyId: 'runtime-main', stepId: 'runtime-step' } }],
        edges: [{ id: 'runtime-edge', from: 'runtime-node', to: 'future-node', kind: 'event' }],
      })
    })

    const graph = getStoryGraphProjection(engine).graphs['runtime-main']
    expect(graph.metadata).toEqual(expect.objectContaining({ contentPackageId: 'runtime.graph' }))
    expect(graph.nodes[0].point.contentPackageId).toBe('runtime.graph')
    expect(graph.nodes[0].metadata).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.graph',
      requiredRuntimePackages: ['runtime.graph-assets'],
    }))
    expect(graph.edges?.[0].metadata).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.graph',
      requiredRuntimePackages: ['runtime.graph-assets'],
    }))
    expect(graph.lanes?.[0].metadata).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.graph',
      requiredRuntimePackages: ['runtime.graph-assets'],
    }))

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.graph')

    expect(getStoryGraphProjection(engine).graphs['runtime-main']).toBeUndefined()
  })

  it('does not resurrect package-owned base graphs after later delta rebuilds', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()

    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-a',
      graphId: 'main',
      nodes: [{ id: 'a-node', point: { storyId: 'main', stepId: 'a-step' } }],
    }, { packageId: 'runtime.scene.a' })
    await engine.withRuntimePackageContext('runtime.graph', async (runtimeEngine) => {
      await registerStoryGraphWithEngine(runtimeEngine, {
        id: 'runtime-main',
        nodes: [{ id: 'runtime-node', point: { storyId: 'runtime-main', stepId: 'runtime-step' } }],
      })
    })

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.graph')
    await registerStoryGraphDeltaWithEngine(engine, {
      id: 'delta:runtime-b',
      graphId: 'main',
      nodes: [{ id: 'b-node', point: { storyId: 'main', stepId: 'b-step' } }],
    }, { packageId: 'runtime.scene.b' })

    expect(getStoryGraphProjection(engine).graphs['runtime-main']).toBeUndefined()
    expect(getStoryGraphProjection(engine).graphs.main.nodes.map(node => node.id).sort()).toEqual([
      'a-node',
      'b-node',
    ])
  })

  it('preserves valid forward-declared edges when another package unloads', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    await engine.init()
    await registerStoryGraphWithEngine(engine, {
      id: 'main',
      nodes: [{ id: 'base', point: { storyId: 'main', stepId: 'base' } }],
      edges: [],
    })

    await engine.withRuntimePackageContext('runtime.scene.a', async (runtimeAEngine) => {
      await registerStoryGraphDeltaWithEngine(runtimeAEngine, {
        id: 'delta:runtime-a',
        graphId: 'main',
        nodes: [{ id: 'a-node', point: { storyId: 'main', stepId: 'a-step' } }],
        edges: [{ from: 'base', to: 'a-node', kind: 'event' }],
      }, { packageId: 'runtime.scene.a' })
    })
    await engine.withRuntimePackageContext('runtime.scene.b', async (runtimeBEngine) => {
      await registerStoryGraphDeltaWithEngine(runtimeBEngine, {
        id: 'delta:runtime-b',
        graphId: 'main',
        nodes: [{ id: 'b-node', point: { storyId: 'main', stepId: 'b-step' } }],
        edges: [{ from: 'b-node', to: 'future-c-node', kind: 'event' }],
      }, { packageId: 'runtime.scene.b' })
    })

    await removeRuntimePackageStoryGraphContentWithEngine(engine, 'runtime.scene.a')

    expect(getStoryGraphProjection(engine).graphs.main.edges).toEqual([
      expect.objectContaining({
        from: 'b-node',
        to: 'future-c-node',
      }),
    ])
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
