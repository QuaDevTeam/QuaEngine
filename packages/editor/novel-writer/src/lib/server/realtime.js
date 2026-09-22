import { EventEmitter } from 'node:events'

/** @typedef {import('../types').WorkflowEvent} WorkflowEvent */
/** @typedef {import('../types').WorkflowStage} WorkflowStage */
/** @typedef {import('../types').RealtimeMessage} RealtimeMessage */

const realtimeBus = new EventEmitter()
realtimeBus.setMaxListeners(200)

/** @param {WorkflowEvent} event */
export function broadcastWorkflowEvent(event) {
  broadcastProjectRealtimeMessage(event.projectId, {
    type: 'workflow.event',
    projectId: event.projectId,
    event,
    timestamp: new Date().toISOString(),
  })
}

/** @param {{ projectId: string, runId?: string, stage?: WorkflowStage, agentId?: string, sequence: number, delta: string, markdownPreview?: string }} input */
export function broadcastStageContentDelta(input) {
  broadcastProjectRealtimeMessage(input.projectId, {
    type: 'stage.content.delta',
    projectId: input.projectId,
    runId: input.runId,
    stage: input.stage,
    agentId: input.agentId,
    sequence: input.sequence,
    delta: input.delta,
    markdownPreview: input.markdownPreview,
    timestamp: new Date().toISOString(),
  })
}

/** @param {{ projectId: string, runId?: string, stage?: WorkflowStage, agentId?: string, markdown: string }} input */
export function broadcastStageContentDone(input) {
  broadcastProjectRealtimeMessage(input.projectId, {
    type: 'stage.content.done',
    projectId: input.projectId,
    runId: input.runId,
    stage: input.stage,
    agentId: input.agentId,
    markdown: input.markdown,
    timestamp: new Date().toISOString(),
  })
}

/** @param {{ projectId: string, runId?: string, stage?: WorkflowStage, agentId?: string, message: string }} input */
export function broadcastStageContentError(input) {
  broadcastProjectRealtimeMessage(input.projectId, {
    type: 'stage.content.error',
    projectId: input.projectId,
    runId: input.runId,
    stage: input.stage,
    agentId: input.agentId,
    message: input.message,
    timestamp: new Date().toISOString(),
  })
}

/** @param {string} projectId @param {RealtimeMessage} message */
export function broadcastProjectRealtimeMessage(projectId, message) {
  realtimeBus.emit(channelForProject(projectId), message)
}

/** @param {string} projectId @param {(message: RealtimeMessage) => void} listener */
export function subscribeProjectRealtimeMessages(projectId, listener) {
  const channel = channelForProject(projectId)
  realtimeBus.on(channel, listener)
  return () => realtimeBus.off(channel, listener)
}

/** @param {string} projectId */
function channelForProject(projectId) {
  return `project:${projectId}`
}
