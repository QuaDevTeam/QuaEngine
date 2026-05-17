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

export interface StoryGraphDelta {
  id: string
  graphId?: string
  operation?: 'upsert' | 'remove'
  nodes?: readonly Partial<StoryNode>[]
  edges?: readonly Partial<StoryEdge>[]
  lanes?: readonly Partial<StoryLane>[]
  timelines?: readonly Partial<StoryLane>[]
  metadata?: Record<string, unknown>
}

interface RuntimeStoryGraphDeltaState {
  baseGraphs: Readonly<Record<string, StoryGraph>>
  packageDeltas: Map<string, StoryGraphDelta[]>
}

interface RuntimePackageGraphCleanup {
  graphs: Record<string, StoryGraph>
  removedNodeIds: Set<string>
  changed: boolean
}

const runtimeStoryGraphDeltas = new WeakMap<object, RuntimeStoryGraphDeltaState>()

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

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await removeRuntimePackageStoryGraphContentWithEngine(ctx.engine, packageId)
    }
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
        { name: 'registerStoryGraphDeltaWithEngine', fn: registerStoryGraphDeltaWithEngine, module: this.name },
        { name: 'removeRuntimePackageStoryGraphContentWithEngine', fn: removeRuntimePackageStoryGraphContentWithEngine, module: this.name },
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
  const normalizedGraph = withCurrentRuntimeStoryGraphPackage(engine, graph)
  const runtimeState = runtimeStoryGraphDeltas.get(runtimeStoryGraphDeltaKey(engine))
  if (runtimeState) {
    runtimeState.baseGraphs = {
      ...runtimeState.baseGraphs,
      [normalizedGraph.id]: cloneStoryGraph(normalizedGraph),
    }
    await rebuildRuntimeStoryGraphDeltas(engine, runtimeState)
    return
  }

  const projection = getStoryGraphProjection(engine)
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs: {
      ...projection.graphs,
      [normalizedGraph.id]: cloneStoryGraph(normalizedGraph),
    },
  })
}

export async function registerStoryGraphDeltaWithEngine(
  engine: QuaEngineInterface,
  delta: StoryGraphDelta,
  options: { packageId?: string } = {},
): Promise<void> {
  if (options.packageId) {
    const runtimeState = getRuntimeStoryGraphDeltaState(engine)
    const packageDeltas = runtimeState.packageDeltas.get(options.packageId) || []
    runtimeState.packageDeltas.set(options.packageId, [...packageDeltas, delta])
    await rebuildRuntimeStoryGraphDeltas(engine, runtimeState)
    return
  }

  const point = engine.getStoryPoint()
  const projection = getStoryGraphProjection(engine)
  const graphs = applyStoryGraphDeltaToGraphMap(projection.graphs, delta, point)
  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs,
  })
}

export async function removeRuntimePackageStoryGraphContentWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<void> {
  const runtimeStateKey = runtimeStoryGraphDeltaKey(engine)
  const runtimeState = runtimeStoryGraphDeltas.get(runtimeStateKey)
  if (runtimeState) {
    const removedDeltaNodeIds = collectDeltaNodeIds(runtimeState.packageDeltas.get(packageId) || [])
    const baseCleanup = removeRuntimePackageContentFromGraphs(runtimeState.baseGraphs, packageId)
    if (baseCleanup.changed) {
      runtimeState.baseGraphs = baseCleanup.graphs
    }
    if (runtimeState.packageDeltas.has(packageId) || baseCleanup.changed) {
      const removedNodeIds = unionSets(removedDeltaNodeIds, baseCleanup.removedNodeIds)
      runtimeState.packageDeltas.delete(packageId)
      await rebuildRuntimeStoryGraphDeltas(engine, runtimeState, packageId, removedNodeIds)
      if (runtimeState.packageDeltas.size === 0) {
        runtimeStoryGraphDeltas.delete(runtimeStateKey)
      }
      return
    }
  }

  const projection = getStoryGraphProjection(engine)
  const cleanup = removeRuntimePackageContentFromGraphs(projection.graphs, packageId)
  const cleaned = cleanRuntimePackageProjectionState({ ...projection, graphs: cleanup.graphs }, packageId, cleanup.graphs)
  const changed = cleanup.changed
    || Object.keys(cleaned.cursors).length !== Object.keys(projection.cursors).length
    || cleaned.events.length !== projection.events.length
    || cleaned.unlockedNodes.length !== projection.unlockedNodes.length

  if (!changed) {
    return
  }

  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs: cleanup.graphs,
    cursors: cleaned.cursors,
    unlockedNodes: cleaned.unlockedNodes,
    events: cleaned.events,
  })
}

function removeRuntimePackageContentFromGraphs(
  currentGraphs: Readonly<Record<string, StoryGraph>>,
  packageId: string,
): RuntimePackageGraphCleanup {
  const graphs: Record<string, StoryGraph> = {}
  const removedNodeIds = new Set<string>()
  let changed = false

  for (const [graphId, graph] of Object.entries(currentGraphs)) {
    const removedGraphNodeIds = new Set<string>()
    const nodes = graph.nodes.filter((node) => {
      const remove = storyNodeBelongsToPackage(node, packageId)
      if (remove) {
        removedGraphNodeIds.add(node.id)
        removedNodeIds.add(node.id)
      }
      return !remove
    })
    const edges = (graph.edges || []).filter(edge =>
      !storyEdgeBelongsToPackage(edge, packageId)
      && !removedGraphNodeIds.has(edge.from)
      && !removedGraphNodeIds.has(edge.to),
    )
    const lanes = (graph.lanes || []).filter(lane => !metadataBelongsToPackage(lane.metadata, packageId))
    const metadata = metadataBelongsToPackage(graph.metadata, packageId)
      ? stripRuntimePackageMetadata(graph.metadata)
      : graph.metadata

    const nextGraph: StoryGraph = {
      ...graph,
      metadata,
      nodes,
      edges,
      lanes,
    }
    const graphChanged = nodes.length !== graph.nodes.length
      || edges.length !== (graph.edges || []).length
      || lanes.length !== (graph.lanes || []).length
      || metadata !== graph.metadata
    changed = changed || graphChanged

    if (nodes.length === 0 && edges.length === 0 && lanes.length === 0 && metadataBelongsToPackage(graph.metadata, packageId)) {
      changed = true
      continue
    }
    graphs[graphId] = nextGraph
  }

  return { graphs, removedNodeIds, changed }
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

function createEmptyGraph(graphId: string): StoryGraph {
  return {
    id: graphId,
    nodes: [],
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

function getRuntimeStoryGraphDeltaState(engine: QuaEngineInterface): RuntimeStoryGraphDeltaState {
  const key = runtimeStoryGraphDeltaKey(engine)
  const existing = runtimeStoryGraphDeltas.get(key)
  if (existing) {
    return existing
  }
  const state: RuntimeStoryGraphDeltaState = {
    baseGraphs: cloneGraphMap(getStoryGraphProjection(engine).graphs),
    packageDeltas: new Map(),
  }
  runtimeStoryGraphDeltas.set(key, state)
  return state
}

function runtimeStoryGraphDeltaKey(engine: QuaEngineInterface): object {
  return engine.getStore()
}

async function rebuildRuntimeStoryGraphDeltas(
  engine: QuaEngineInterface,
  state: RuntimeStoryGraphDeltaState,
  removedPackageId?: string,
  removedNodeIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const projection = getStoryGraphProjection(engine)
  const point = engine.getStoryPoint()
  let graphs = cloneGraphMap(state.baseGraphs)

  for (const [packageId, deltas] of state.packageDeltas.entries()) {
    for (const delta of deltas) {
      graphs = applyStoryGraphDeltaToGraphMap(graphs, delta, point, packageId)
    }
  }
  const missingRemovedNodeIds = difference(removedNodeIds, getGraphNodeIds(graphs))
  if (missingRemovedNodeIds.size > 0) {
    graphs = pruneStoryGraphEdgesReferencingNodes(graphs, missingRemovedNodeIds)
  }

  const cleaned = removedPackageId
    ? cleanRuntimePackageProjectionState({ ...projection, graphs }, removedPackageId, graphs)
    : { cursors: projection.cursors, events: projection.events, unlockedNodes: projection.unlockedNodes }

  await engine.setPluginProjection(STORY_GRAPH_PLUGIN_ID, {
    ...projection,
    revision: projection.revision + 1,
    graphs,
    cursors: cleaned.cursors,
    events: cleaned.events,
    unlockedNodes: cleaned.unlockedNodes,
  })
}

function applyStoryGraphDeltaToGraphMap(
  graphs: Readonly<Record<string, StoryGraph>>,
  delta: StoryGraphDelta,
  fallbackPoint?: StoryPoint,
  packageId?: string,
): Record<string, StoryGraph> {
  const graphId = delta.graphId || fallbackPoint?.storyId || 'default'
  if (delta.operation === 'remove') {
    const next = { ...graphs }
    delete next[graphId]
    return next
  }

  const packageMetadata = packageId ? { contentPackageId: packageId } : {}
  const existingGraph = graphs[graphId] || (fallbackPoint
    ? createImplicitGraph(graphId, fallbackPoint)
    : createEmptyGraph(graphId))
  const nextGraph: StoryGraph = {
    ...existingGraph,
    metadata: {
      ...(existingGraph.metadata || {}),
      ...(delta.metadata || {}),
      ...packageMetadata,
    },
    nodes: mergeById(existingGraph.nodes, (delta.nodes || []).map(node => normalizeDeltaNode(node, graphId, packageMetadata))),
    edges: mergeById(existingGraph.edges || [], (delta.edges || []).map(edge => normalizeDeltaEdge(edge, packageMetadata))),
    lanes: mergeById(existingGraph.lanes || [], [
      ...(delta.lanes || []).map(lane => normalizeDeltaLane(lane, packageMetadata)),
      ...(delta.timelines || []).map(lane => normalizeDeltaLane({ ...lane, kind: lane.kind || 'timeline' }, packageMetadata)),
    ]),
  }

  return {
    ...graphs,
    [graphId]: nextGraph,
  }
}

function cleanRuntimePackageProjectionState(
  projection: StoryGraphProjection,
  packageId: string,
  graphs: Readonly<Record<string, StoryGraph>>,
): Pick<StoryGraphProjection, 'cursors' | 'events' | 'unlockedNodes'> {
  const graphNodeIds = getGraphNodeIds(graphs)
  return {
    cursors: Object.fromEntries(
      Object.entries(projection.cursors).filter(([, cursor]) => cursor.point.contentPackageId !== packageId),
    ),
    events: projection.events.filter(event => event.point?.contentPackageId !== packageId),
    unlockedNodes: projection.unlockedNodes.filter(nodeId => graphNodeIds.has(nodeId)),
  }
}

function getGraphNodeIds(graphs: Readonly<Record<string, StoryGraph>>): Set<string> {
  const ids = new Set<string>()
  for (const graph of Object.values(graphs)) {
    for (const node of graph.nodes) {
      ids.add(node.id)
    }
  }
  return ids
}

function difference(values: ReadonlySet<string>, excluded: ReadonlySet<string>): Set<string> {
  const result = new Set<string>()
  for (const value of values) {
    if (!excluded.has(value)) {
      result.add(value)
    }
  }
  return result
}

function unionSets(...sets: ReadonlyArray<ReadonlySet<string>>): Set<string> {
  const result = new Set<string>()
  for (const set of sets) {
    for (const value of set) {
      result.add(value)
    }
  }
  return result
}

function collectDeltaNodeIds(deltas: readonly StoryGraphDelta[]): Set<string> {
  const nodeIds = new Set<string>()
  for (const delta of deltas) {
    for (const node of delta.nodes || []) {
      const id = node.id || node.point?.nodeId || node.point?.stepId
      if (id) {
        nodeIds.add(id)
      }
    }
  }
  return nodeIds
}

function pruneStoryGraphEdgesReferencingNodes(
  graphs: Readonly<Record<string, StoryGraph>>,
  removedNodeIds: ReadonlySet<string>,
): Record<string, StoryGraph> {
  return Object.fromEntries(Object.entries(graphs).map(([graphId, graph]) => {
    const edges = (graph.edges || []).filter(edge => !removedNodeIds.has(edge.from) && !removedNodeIds.has(edge.to))
    return [graphId, {
      ...graph,
      edges,
    }]
  }))
}

function cloneGraphMap(graphs: Readonly<Record<string, StoryGraph>>): Record<string, StoryGraph> {
  return Object.fromEntries(Object.entries(graphs).map(([id, graph]) => [id, cloneStoryGraph(graph)]))
}

function normalizeDeltaNode(
  node: Partial<StoryNode>,
  graphId: string,
  metadata: Record<string, unknown>,
): StoryNode {
  const id = node.id || node.point?.nodeId || node.point?.stepId
  if (!id) {
    throw new Error(`Story graph delta for "${graphId}" contains a node without an id.`)
  }
  const point = {
    storyId: graphId,
    ...(node.point || { stepId: id, nodeId: id }),
    stepId: node.point?.stepId || id,
    nodeId: node.point?.nodeId || id,
    contentPackageId: node.point?.contentPackageId || (typeof metadata.contentPackageId === 'string' ? metadata.contentPackageId : undefined),
  }
  return {
    id,
    point,
    title: node.title,
    laneId: node.laneId || point.laneId,
    routeId: node.routeId || point.routeId,
    timelineId: node.timelineId || point.timelineId,
    protagonistId: node.protagonistId || point.protagonistId,
    chapterId: node.chapterId || point.chapterId,
    metadata: {
      ...(node.metadata || {}),
      ...metadata,
    },
  }
}

function normalizeDeltaEdge(edge: Partial<StoryEdge>, metadata: Record<string, unknown>): StoryEdge {
  if (!edge.from || !edge.to) {
    throw new Error('Story graph delta edge requires both "from" and "to".')
  }
  return {
    id: edge.id || `${edge.kind || 'event'}:${edge.from}:${edge.to}`,
    from: edge.from,
    to: edge.to,
    kind: edge.kind || 'event',
    condition: edge.condition,
    event: edge.event,
    metadata: {
      ...(edge.metadata || {}),
      ...metadata,
    },
  }
}

function normalizeDeltaLane(lane: Partial<StoryLane>, metadata: Record<string, unknown>): StoryLane {
  if (!lane.id) {
    throw new Error('Story graph delta lane requires an id.')
  }
  return {
    id: lane.id,
    kind: lane.kind,
    title: lane.title,
    metadata: {
      ...(lane.metadata || {}),
      ...metadata,
    },
  }
}

function storyNodeBelongsToPackage(node: StoryNode, packageId: string): boolean {
  return node.point.contentPackageId === packageId || metadataBelongsToPackage(node.metadata, packageId)
}

function storyEdgeBelongsToPackage(edge: StoryEdge, packageId: string): boolean {
  return metadataBelongsToPackage(edge.metadata, packageId)
}

function metadataBelongsToPackage(metadata: Readonly<Record<string, unknown>> | undefined, packageId: string): boolean {
  return metadata?.contentPackageId === packageId
}

function withCurrentRuntimeStoryGraphPackage(engine: QuaEngineInterface, graph: StoryGraph): StoryGraph {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return graph
  }
  return {
    ...graph,
    metadata: mergeRuntimeMetadata(graph.metadata, packageId),
    nodes: graph.nodes.map(node => ({
      ...node,
      point: {
        ...node.point,
        contentPackageId: node.point.contentPackageId || packageId,
      },
      metadata: mergeRuntimeMetadata(node.metadata, packageId),
    })),
    edges: graph.edges?.map(edge => ({
      ...edge,
      metadata: mergeRuntimeMetadata(edge.metadata, packageId),
    })),
    lanes: graph.lanes?.map(lane => ({
      ...lane,
      metadata: mergeRuntimeMetadata(lane.metadata, packageId),
    })),
  }
}

function mergeRuntimeMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packageId: string,
): Record<string, unknown> {
  if (metadata?.contentPackageId) {
    return { ...metadata }
  }
  return {
    ...(metadata || {}),
    contentPackageId: packageId,
  }
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}

function stripRuntimePackageMetadata<TMetadata extends Readonly<Record<string, unknown>> | undefined>(
  metadata: TMetadata,
): TMetadata {
  if (!metadata) {
    return metadata
  }
  const { contentPackageId, ...rest } = metadata
  void contentPackageId
  return (Object.keys(rest).length > 0 ? rest : undefined) as TMetadata
}

function mergeById<T extends { id: string }>(base: readonly T[], patches: readonly T[]): T[] {
  const map = new Map(base.map(item => [item.id, item]))
  for (const patch of patches) {
    map.set(patch.id, {
      ...(map.get(patch.id) || {}),
      ...patch,
      metadata: {
        ...((map.get(patch.id) as { metadata?: Record<string, unknown> } | undefined)?.metadata || {}),
        ...((patch as { metadata?: Record<string, unknown> }).metadata || {}),
      },
    } as T)
  }
  return Array.from(map.values())
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
