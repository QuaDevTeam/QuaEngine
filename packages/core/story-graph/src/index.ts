import type { ChoiceIntent, EngineContext, JumpOptions, QuaEngineInterface, StoryPoint } from '@quajs/engine'
import { BaseEnginePlugin, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/engine'
import { storyGraphDecoratorMappings } from './script-compiler'

export const STORY_GRAPH_PLUGIN_ID = 'storyGraph' as const

export type StoryEdgeKind = 'choice' | 'event' | 'unlock' | 'interaction' | 'jump'

export interface StoryGraph {
  id: string
  nodes: readonly StoryNode[]
  edges?: readonly StoryEdge[]
  lanes?: readonly StoryLane[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface StoryNode {
  id: string
  point: StoryPoint
  title?: string
  laneId?: string
  routeId?: string
  timelineId?: string
  protagonistId?: string
  chapterId?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface StoryEdge {
  id: string
  from: string
  to: string
  kind: StoryEdgeKind
  condition?: string
  event?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface StoryLane {
  id: string
  kind?: 'main' | 'route' | 'timeline' | 'protagonist' | string
  title?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface StoryCursor {
  id: string
  point: StoryPoint
  updatedAt: number
}

export interface StoryGraphProjection {
  revision: number
  graphs: Readonly<Record<string, StoryGraph>>
  cursors: Readonly<Record<string, StoryCursor>>
  unlockedNodes: readonly string[]
  events: readonly StoryEventRecord[]
}

export interface StoryEventRecord {
  id: string
  type: string
  payload?: Readonly<Record<string, unknown>>
  point?: StoryPoint
  timestamp: number
}

export interface StoryGraphPluginOptions {
  defaultCursorId?: string
}

export class StoryGraphPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/story-graph'
  readonly id = STORY_GRAPH_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Story graph metadata, multi-lane cursors, events, and jump helpers'
  private disposers: Array<() => void> = []

  protected setup(ctx: EngineContext): void {
    this.disposers.push(onPipeline(ctx.pipeline, LogicToRenderEvents.DIALOGUE_CHOICE, async (payload) => {
      await recordChoiceEdgesWithEngine(ctx.engine, (payload as { choices?: ChoiceIntent[] }).choices || [])
    }))
    this.disposers.push(onPipeline(ctx.pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, async (payload) => {
      await recordChoiceEdgeWithEngine(ctx.engine, payload as { choiceId?: string })
    }))
  }

  override async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    await super.destroy?.()
  }

  override async onStepStart(ctx: EngineContext): Promise<void> {
    if (!ctx.point) {
      return
    }
    await setCursor(ctx.engine, this.getDefaultCursorId(), ctx.point)
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'registerStoryGraphWithEngine', fn: registerStoryGraphWithEngine, module: this.name },
        { name: 'enterStoryPointWithEngine', fn: enterStoryPointWithEngine, module: this.name },
        { name: 'jumpToStoryPointWithEngine', fn: jumpToStoryPointWithEngine, module: this.name },
        { name: 'emitStoryEventWithEngine', fn: emitStoryEventWithEngine, module: this.name },
        { name: 'unlockStoryNodeWithEngine', fn: unlockStoryNodeWithEngine, module: this.name },
        { name: 'setStoryMetadataWithEngine', fn: setStoryMetadataWithEngine, module: this.name },
        { name: 'recordChoiceEdgeWithEngine', fn: recordChoiceEdgeWithEngine, module: this.name },
        { name: 'recordChoiceEdgesWithEngine', fn: recordChoiceEdgesWithEngine, module: this.name },
      ],
      decorators: storyGraphDecoratorMappings,
    }
  }

  private getDefaultCursorId(): string {
    const options = this.options as StoryGraphPluginOptions
    return options.defaultCursorId || 'main'
  }
}

export async function registerStoryGraphWithEngine(
  engine: QuaEngineInterface,
  graph: StoryGraph,
): Promise<void> {
  const projection = getStoryGraphProjection(engine)
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs: {
      ...projection.graphs,
      [graph.id]: cloneStoryGraph(graph),
    },
  })
}

export async function enterStoryPointWithEngine(
  engine: QuaEngineInterface,
  point: StoryPoint,
  options: { cursorId?: string } = {},
): Promise<void> {
  await engine.setStoryPoint(point)
  await setCursor(engine, options.cursorId || 'main', point)
}

export async function jumpToStoryPointWithEngine(
  engine: QuaEngineInterface,
  point: StoryPoint,
  options: JumpOptions & { cursorId?: string } = {},
): Promise<void> {
  await engine.jumpTo(point, options)
  await setCursor(engine, options.cursorId || 'main', engine.getStoryPoint() || point)
}

export async function emitStoryEventWithEngine(
  engine: QuaEngineInterface,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const projection = getStoryGraphProjection(engine)
  const event: StoryEventRecord = {
    id: `${type}:${Date.now()}:${projection.events.length + 1}`,
    type,
    payload: { ...payload },
    point: engine.getStoryPoint(),
    timestamp: Date.now(),
  }
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    events: [...projection.events, event],
  })
}

export async function unlockStoryNodeWithEngine(
  engine: QuaEngineInterface,
  nodeId: string,
): Promise<void> {
  const projection = getStoryGraphProjection(engine)
  if (projection.unlockedNodes.includes(nodeId)) {
    return
  }
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    unlockedNodes: [...projection.unlockedNodes, nodeId],
  })
}

export async function recordChoiceEdgeWithEngine(
  engine: QuaEngineInterface,
  payload: { choiceId?: string },
): Promise<void> {
  if (!payload.choiceId) {
    return
  }
  const choice = engine.getViewState().choices.find(item => item.id === payload.choiceId)
  await recordChoiceEdgesWithEngine(engine, choice ? [choice] : [])
}

export async function recordChoiceEdgesWithEngine(
  engine: QuaEngineInterface,
  choices: ReadonlyArray<Pick<ChoiceIntent, 'id' | 'text' | 'metadata'>>,
): Promise<void> {
  const point = engine.getStoryPoint()
  if (!point || choices.length === 0) {
    return
  }

  const graphId = point.storyId || 'default'
  const from = point.nodeId || point.stepId
  const projection = getStoryGraphProjection(engine)
  const existingGraph = projection.graphs[graphId] || createImplicitGraph(graphId, point)
  const nextEdges = [...(existingGraph.edges || [])]
  let changed = false

  for (const choice of choices) {
    const edgeIntent = getChoiceEdgeIntent(choice?.metadata)
    const target = edgeIntent?.to || getChoiceTarget(choice?.metadata)
    if (!target) {
      continue
    }

    const edgeId = edgeIntent?.id || `choice:${graphId}:${from}:${target}`
    const edge: StoryEdge = {
      id: edgeId,
      from,
      to: target,
      kind: 'choice',
      condition: typeof choice?.metadata?.condition === 'string' ? choice.metadata.condition : edgeIntent?.condition,
      metadata: {
        ...(edgeIntent?.metadata || {}),
        choiceId: choice.id,
        text: choice.text,
      },
    }
    const existingIndex = nextEdges.findIndex(item => item.id === edge.id)
    if (existingIndex === -1) {
      nextEdges.push(edge)
    }
    else {
      nextEdges[existingIndex] = edge
    }
    changed = true
  }

  if (!changed) {
    return
  }

  const nextGraph: StoryGraph = {
    ...existingGraph,
    nodes: ensureChoiceEdgeNodes(existingGraph.nodes, point, nextEdges),
    edges: nextEdges,
  }

  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs: {
      ...projection.graphs,
      [graphId]: nextGraph,
    },
  })
}

export async function setStoryMetadataWithEngine(
  engine: QuaEngineInterface,
  patch: Partial<StoryPoint> & { metadata?: Record<string, unknown> },
  options: { cursorId?: string } = {},
): Promise<void> {
  const current = engine.getStoryPoint()
  const pointPatch = stripStoryMetadata(patch)
  const stepId = patch.stepId || current?.stepId || engine.getCurrentStepId()
  if (!stepId) {
    return
  }
  const point: StoryPoint = {
    ...(current || { stepId }),
    ...pointPatch,
    stepId,
  }
  await enterStoryPointWithEngine(engine, point, options)
  await upsertStoryNodeWithEngine(engine, point, patch.metadata)
}

function stripStoryMetadata(patch: Partial<StoryPoint> & { metadata?: Record<string, unknown> }): Partial<StoryPoint> {
  const { metadata, ...pointPatch } = patch
  void metadata
  return pointPatch
}

export function getStoryGraphProjection(engine: QuaEngineInterface): StoryGraphProjection {
  return engine.getPluginProjection<StoryGraphProjection>(STORY_GRAPH_PLUGIN_ID) || createInitialStoryGraphProjection()
}

export function createInitialStoryGraphProjection(): StoryGraphProjection {
  return {
    revision: 0,
    graphs: {},
    cursors: {},
    unlockedNodes: [],
    events: [],
  }
}

async function setCursor(engine: QuaEngineInterface, cursorId: string, point: StoryPoint): Promise<void> {
  const projection = getStoryGraphProjection(engine)
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    cursors: {
      ...projection.cursors,
      [cursorId]: {
        id: cursorId,
        point: { ...point },
        updatedAt: Date.now(),
      },
    },
  })
}

async function upsertStoryNodeWithEngine(
  engine: QuaEngineInterface,
  point: StoryPoint,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const graphId = point.storyId || 'default'
  const nodeId = point.nodeId || point.stepId
  const projection = getStoryGraphProjection(engine)
  const graph = projection.graphs[graphId] || createImplicitGraph(graphId, point)
  const existingNode = graph.nodes.find(node => node.id === nodeId)
  const node: StoryNode = {
    ...(existingNode || createStoryNodeFromPoint(nodeId, point)),
    point: {
      ...(existingNode?.point || {}),
      ...point,
    },
    laneId: point.laneId || existingNode?.laneId,
    routeId: point.routeId || existingNode?.routeId,
    timelineId: point.timelineId || existingNode?.timelineId,
    protagonistId: point.protagonistId || existingNode?.protagonistId,
    chapterId: point.chapterId || existingNode?.chapterId,
    metadata: metadata
      ? { ...(existingNode?.metadata || {}), ...metadata }
      : existingNode?.metadata,
  }
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs: {
      ...projection.graphs,
      [graphId]: {
        ...graph,
        nodes: graph.nodes.some(item => item.id === nodeId)
          ? graph.nodes.map(item => item.id === nodeId ? node : item)
          : [...graph.nodes, node],
      },
    },
  })
}

function cloneStoryGraph(graph: StoryGraph): StoryGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(node => ({
      ...node,
      point: { ...node.point },
      metadata: node.metadata ? { ...node.metadata } : undefined,
    })),
    edges: graph.edges?.map(edge => ({
      ...edge,
      metadata: edge.metadata ? { ...edge.metadata } : undefined,
    })),
    lanes: graph.lanes?.map(lane => ({
      ...lane,
      metadata: lane.metadata ? { ...lane.metadata } : undefined,
    })),
    metadata: graph.metadata ? { ...graph.metadata } : undefined,
  }
}

function createImplicitGraph(graphId: string, point: StoryPoint): StoryGraph {
  return {
    id: graphId,
    nodes: [createStoryNodeFromPoint(point.nodeId || point.stepId, point)],
    edges: [],
  }
}

function ensureChoiceEdgeNodes(
  nodes: readonly StoryNode[],
  fromPoint: StoryPoint,
  edges: readonly StoryEdge[],
): StoryNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const fromNodeId = fromPoint.nodeId || fromPoint.stepId
  if (!byId.has(fromNodeId)) {
    byId.set(fromNodeId, createStoryNodeFromPoint(fromNodeId, fromPoint))
  }
  for (const edge of edges) {
    if (!byId.has(edge.to)) {
      byId.set(edge.to, createStoryNodeFromPoint(edge.to, {
        ...fromPoint,
        nodeId: edge.to,
        stepId: edge.to,
      }))
    }
  }
  return Array.from(byId.values())
}

function createStoryNodeFromPoint(id: string, point: StoryPoint): StoryNode {
  return {
    id,
    point: { ...point },
    laneId: point.laneId,
    routeId: point.routeId,
    timelineId: point.timelineId,
    protagonistId: point.protagonistId,
    chapterId: point.chapterId,
  }
}

function getChoiceTarget(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof metadata?.target === 'string' ? metadata.target : undefined
}

function getChoiceEdgeIntent(metadata: Readonly<Record<string, unknown>> | undefined): {
  id?: string
  to?: string
  condition?: string
  metadata?: Record<string, unknown>
} | undefined {
  const storyGraph = metadata?.storyGraph
  if (!storyGraph || typeof storyGraph !== 'object') {
    return undefined
  }
  const edge = (storyGraph as { edge?: unknown }).edge
  if (!edge || typeof edge !== 'object') {
    return undefined
  }
  const value = edge as Record<string, unknown>
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    to: typeof value.to === 'string' ? value.to : undefined,
    condition: typeof value.condition === 'string' ? value.condition : undefined,
    metadata: value.metadata && typeof value.metadata === 'object'
      ? { ...(value.metadata as Record<string, unknown>) }
      : undefined,
  }
}

function onPipeline<T>(
  pipeline: EngineContext['pipeline'],
  type: string,
  handler: (payload: T) => void | Promise<void>,
): () => void {
  const listener = async (context: { event: { payload: T } }) => {
    await handler(context.event.payload)
  }
  pipeline.on(type, listener as Parameters<EngineContext['pipeline']['on']>[1])
  return () => pipeline.off(type, listener as Parameters<EngineContext['pipeline']['off']>[1])
}

export { decorators, scriptCompiler, storyGraphDecoratorMappings } from './script-compiler'
