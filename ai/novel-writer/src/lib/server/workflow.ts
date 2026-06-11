import { randomUUID } from 'node:crypto'
import type {
  AgentDefinition,
  ArtifactRef,
  NovelProject,
  ProjectInputRevision,
  ReviewFinding,
  ReviewReport,
  RunMode,
  SearchReference,
  WorkflowStage,
} from '$lib/types'
import { getAgentForStage, loadAgentSkills, stageTitle, workflowOrder } from './agents'
import { compactArtifacts, formatPinnedProjectCanon } from './context'
import { DeepSeekClient, type DeepSeekMessage, type DeepSeekRunResult, type RegisteredDeepSeekTool } from './deepseek'
import { TavilySearchTool, type TavilySearchInput } from './tavily'
import { normalizeVisualNovelMarkdown } from './visual-novel-format'
import { broadcastStageContentDelta, broadcastStageContentDone, broadcastStageContentError } from './realtime.js'
import {
  appendConversation,
  appendEvent,
  artifactIdFor,
  listArtifacts,
  readCheckpoint,
  readConfig,
  readProject,
  updateArtifactMarkdown,
  updateArtifactStatus,
  writeArtifact,
  writeCheckpoint,
  writeProject,
} from './store'

const activeRuns = new Map<string, Promise<void>>()
const checkpointLocks = new Map<string, Promise<void>>()

type StageRunOptions = {
  feedback?: string
  excludeArtifactIds?: string[]
  /** For per-chapter stages: 0-based chapter index within the approved outline. */
  chapterIndex?: number
  chapterTitle?: string
}

const chapterStages: WorkflowStage[] = ['scene_writing', 'chapter_editing', 'chapter_supervision']
const postChapterStages: WorkflowStage[] = ['supervision', 'editing', 'final']

function emptyCheckpoint(projectId: string): import('$lib/types').ResumeCheckpoint {
  return { projectId, completedStages: [], updatedAt: new Date().toISOString() }
}

function mergeCompletedStages(existing: WorkflowStage[] | undefined, stages: WorkflowStage[]): WorkflowStage[] {
  const completed = new Set([...(existing ?? []), ...stages])
  return workflowOrder.filter(stage => completed.has(stage))
}

function mergeCompletedChapterStages(
  existing: Array<{ stage: WorkflowStage; chapterIndex: number }> | undefined,
  stages: Array<{ stage: WorkflowStage; chapterIndex: number }>,
): Array<{ stage: WorkflowStage; chapterIndex: number }> {
  const byKey = new Map((existing ?? []).map(item => [`${item.stage}:${item.chapterIndex}`, item]))
  for (const stage of stages) {
    byKey.set(`${stage.stage}:${stage.chapterIndex}`, stage)
  }
  return [...byKey.values()]
}

function workflowIsComplete(checkpoint: Awaited<ReturnType<typeof readCheckpoint>>): boolean {
  const completed = new Set(checkpoint?.completedStages ?? [])
  return workflowOrder.every(stage => completed.has(stage))
}

/** Extract chapter titles from outline markdown (mirrors client-side logic). */
function extractChapterTitles(markdown: string): string[] {
  const pattern = /^##\s*第\s*[一二三四五六七八九十\d]+\s*章[\s：:]/im
  return markdown
    .split('\n')
    .filter(line => pattern.test(line))
    .map(line => line.replace(/^##\s*/, '').trim())
}

/** Returns all stages that come after `stage` in workflowOrder. */
function stagesAfter(stage: WorkflowStage): WorkflowStage[] {
  const idx = workflowOrder.indexOf(stage)
  return idx >= 0 ? workflowOrder.slice(idx + 1) : []
}

export function isProjectRunning(projectId: string): boolean {
  return activeRuns.has(projectId)
}

export async function startWorkflow(projectId: string, requestedMode?: RunMode, chapterIndex?: number): Promise<{ runId: string }> {
  if (activeRuns.has(projectId)) {
    throw new Error(`Project is already running: ${projectId}`)
  }

  const runId = randomUUID()
  debugWorkflow('startWorkflow', { projectId, runId, requestedMode, chapterIndex })
  const run = runWorkflow(projectId, runId, requestedMode, chapterIndex).finally(() => {
    activeRuns.delete(projectId)
    debugWorkflow('runSettled', { projectId, runId })
  })
  activeRuns.set(projectId, run)
  return { runId }
}

export async function startProjectRevision(projectId: string, revision: ProjectInputRevision): Promise<{ runId: string } | undefined> {
  if (activeRuns.has(projectId)) {
    throw new Error(`Project is already running: ${projectId}`)
  }
  if (!revision.affectedStages.length) {
    return undefined
  }

  const runId = randomUUID()
  const run = runProjectRevision(projectId, runId, revision).finally(() => {
    activeRuns.delete(projectId)
  })
  activeRuns.set(projectId, run)
  return { runId }
}

export async function recordApproval(projectId: string, input: {
  artifactId: string
  action: 'approve' | 'request_changes' | 'manual_edit' | 'regenerate'
  note?: string
  markdown?: string
}): Promise<void> {
  if (activeRuns.has(projectId)) {
    throw new Error(`Project is already running: ${projectId}`)
  }
  debugWorkflow('recordApproval', { projectId, artifactId: input.artifactId, action: input.action })

  if (input.action === 'regenerate') {
    const artifact = await updateArtifactStatus(projectId, input.artifactId, 'rejected')
    const project = await readProject(projectId)
    const runId = randomUUID()
    await mutateCheckpoint(projectId, checkpoint => {
      const completedStages = new Set(checkpoint?.completedStages || [])
      completedStages.delete(artifact.stage)
      return {
        projectId,
        runId,
        currentStage: artifact.stage,
        completedStages: Array.from(completedStages),
        awaitingApprovalArtifactId: undefined,
        updatedAt: new Date().toISOString(),
      }
    })
    project.status = 'running'
    project.currentStage = artifact.stage
    await writeProject(project)
    await appendEvent({
      projectId,
      runId,
      type: 'run.started',
      stage: artifact.stage,
      agentId: artifact.agentId,
      message: `Regeneration run started for ${stageTitle(artifact.stage)}.`,
    })
    await appendEvent({
      projectId,
      runId,
      type: 'approval.recorded',
      stage: artifact.stage,
      agentId: artifact.agentId,
      status: 'rejected',
      message: `Regeneration requested for ${stageTitle(artifact.stage)}.`,
      payload: input,
    })

    const run = runRegeneration(projectId, runId, artifact, input.note).finally(() => {
      activeRuns.delete(projectId)
    })
    activeRuns.set(projectId, run)
    return
  }

  const status = input.action === 'approve' ? 'approved' : input.action === 'request_changes' ? 'rejected' : 'needs_review'
  const artifact = input.markdown
    ? await updateArtifactMarkdown(projectId, input.artifactId, input.markdown, status)
    : await updateArtifactStatus(projectId, input.artifactId, status)

  const project = await readProject(projectId)
  const appendApprovalRecordedEvent = async () => {
    const event = await appendEvent({
      projectId,
      type: 'approval.recorded',
      stage: artifact.stage,
      agentId: artifact.agentId,
      status,
      message: `Review action recorded: ${input.action}`,
      payload: { ...input, artifactId: artifact.id },
    })
    debugWorkflow('approvalStateWritten', {
      projectId,
      artifactId: artifact.id,
      action: input.action,
      status,
      stage: artifact.stage,
      eventId: event.id,
    })
    return event
  }

  if (input.action === 'approve') {
    await mutateCheckpoint(projectId, checkpoint => {
      const completedStages = new Set(checkpoint?.completedStages || [])
      // For chapter scene_writing, don't mark globally complete — chapter loop handles that
      if (artifact.stage !== 'scene_writing') {
        completedStages.add(artifact.stage)
        // Cascade: when a content stage is approved after manual edit, invalidate all downstream stages
        for (const downstream of stagesAfter(artifact.stage)) {
          completedStages.delete(downstream)
        }
      }
      return {
        ...checkpoint,
        projectId,
        runId: checkpoint?.runId,
        currentStage: artifact.stage,
        completedStages: workflowOrder.filter(stage => completedStages.has(stage)),
        completedChapterStages: artifact.stage === 'scene_writing' && artifact.chapterIndex !== undefined
          ? mergeCompletedChapterStages(checkpoint?.completedChapterStages, [{ stage: 'scene_writing', chapterIndex: artifact.chapterIndex }])
          : checkpoint?.completedChapterStages,
        awaitingApprovalArtifactId: undefined,
        updatedAt: new Date().toISOString(),
      }
    })
    project.status = 'idle'
    project.currentStage = undefined
    await writeProject(project)
    await appendApprovalRecordedEvent()
    return
  }

  if (input.action === 'manual_edit') {
    await mutateCheckpoint(projectId, checkpoint => {
      const completedStages = new Set(checkpoint?.completedStages || [])
      completedStages.delete(artifact.stage)
      // Cascade: invalidate all downstream stages so they re-run on next step/yolo
      for (const downstream of stagesAfter(artifact.stage)) {
        completedStages.delete(downstream)
      }
      return {
        projectId,
        runId: checkpoint?.runId,
        currentStage: artifact.stage,
        completedStages: Array.from(completedStages),
        awaitingApprovalArtifactId: artifact.id,
        updatedAt: new Date().toISOString(),
      }
    })
    project.status = 'awaiting_review'
    project.currentStage = artifact.stage
    await writeProject(project)
    await appendApprovalRecordedEvent()
    return
  }

  await mutateCheckpoint(projectId, checkpoint => {
    const completedStages = new Set(checkpoint?.completedStages || [])
    completedStages.delete(artifact.stage)
    return {
      projectId,
      runId: checkpoint?.runId,
      currentStage: artifact.stage,
      completedStages: Array.from(completedStages),
      awaitingApprovalArtifactId: undefined,
      updatedAt: new Date().toISOString(),
    }
  })
  project.status = 'idle'
  project.currentStage = artifact.stage
  await writeProject(project)
  await appendApprovalRecordedEvent()
}

async function runRegeneration(projectId: string, runId: string, replacedArtifact: ArtifactRef, note?: string): Promise<void> {
  try {
    const artifact = await runStage(projectId, runId, replacedArtifact.stage, 'needs_review', 0, {
      feedback: note,
      excludeArtifactIds: [replacedArtifact.id],
    })
    const project = await readProject(projectId)
    project.status = 'awaiting_review'
    project.currentStage = replacedArtifact.stage
    await writeProject(project)
    await appendEvent({
      projectId,
      runId,
      type: 'stage.awaiting_review',
      stage: replacedArtifact.stage,
      agentId: artifact.agentId,
      status: 'needs_review',
      message: `${stageTitle(replacedArtifact.stage)} was regenerated and is awaiting review.`,
      payload: {
        artifactId: artifact.id,
        regeneratedFrom: replacedArtifact.id,
        note,
      },
    })
  }
  catch (error) {
    const project = await readProject(projectId)
    project.status = 'failed'
    project.currentStage = replacedArtifact.stage
    await writeProject(project)
    await appendEvent({
      projectId,
      runId,
      type: 'run.failed',
      stage: replacedArtifact.stage,
      agentId: replacedArtifact.agentId,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      payload: { regeneratedFrom: replacedArtifact.id },
    })
    throw error
  }
}

export async function appendUserMessage(projectId: string, content: string): Promise<{ reply: string }> {
  const project = await readProject(projectId)
  await appendConversation(projectId, 'requirements_planner', {
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  })
  await appendEvent({
    projectId,
    type: 'message.received',
    agentId: 'requirements_planner',
    message: 'User message recorded.',
    payload: { content },
  })

  const reply = await createPlannerReply(project, content)
  await appendConversation(projectId, 'requirements_planner', {
    role: 'assistant',
    content: reply,
    timestamp: new Date().toISOString(),
  })
  await appendEvent({
    projectId,
    type: 'message.sent',
    agentId: 'requirements_planner',
    message: 'Requirements planner replied.',
    payload: { content: reply },
  })
  return { reply }
}

async function runWorkflow(projectId: string, runId: string, requestedMode?: RunMode, chapterIndex?: number): Promise<void> {
  const project = await readProject(projectId)
  const mode = requestedMode || project.mode
  project.status = 'running'
  project.mode = mode
  await writeProject(project)
  await appendEvent({ projectId, runId, type: 'run.started', message: `Run started in ${mode} mode.` })

  try {
    if (mode === 'yolo') {
      await acceptPendingReviewForYolo(projectId, runId)
    }

    let checkpoint = await readCheckpoint(projectId)
    let completed = new Set(checkpoint?.completedStages || [])
    const nonChapterStages = workflowOrder.filter(stage => !chapterStages.includes(stage))
    const nextNonChapterStage = nonChapterStages.find(stage => !completed.has(stage))

    if (mode === 'step') {
      if (completed.has('outline_review') && !completed.has('scene_writing')) {
        await runChapterLoop(project, runId, mode, chapterIndex, checkpoint)
      }
      else {
        const stages = nextNonChapterStage ? [nextNonChapterStage] : []
        debugWorkflow('runStagesPlanned', { projectId, runId, mode, stages })
        await runStepStages(project, runId, stages)
      }
    }
    else {
      const preChapterStages = workflowOrder.filter(stage =>
        !completed.has(stage)
        && !chapterStages.includes(stage)
        && !postChapterStages.includes(stage),
      )
      debugWorkflow('runStagesPlanned', { projectId, runId, mode, stages: preChapterStages })
      await runYoloStages(project, runId, preChapterStages)

      checkpoint = await readCheckpoint(projectId)
      completed = new Set(checkpoint?.completedStages || [])
      if (completed.has('outline_review') && !completed.has('scene_writing')) {
        await runChapterLoop(project, runId, mode, chapterIndex, checkpoint)
      }

      checkpoint = await readCheckpoint(projectId)
      completed = new Set(checkpoint?.completedStages || [])
      const stages = postChapterStages.filter(stage => !completed.has(stage))
      debugWorkflow('runStagesPlanned', { projectId, runId, mode, stages })
      await runYoloStages(project, runId, stages)
    }

    const refreshed = await readProject(projectId)
    if (refreshed.status !== 'awaiting_review') {
      refreshed.status = workflowIsComplete(await readCheckpoint(projectId)) ? 'completed' : 'idle'
      refreshed.currentStage = undefined
      await writeProject(refreshed)
      await appendEvent({ projectId, runId, type: 'run.completed', message: 'Run completed.' })
    }
  }
  catch (error) {
    const failed = await readProject(projectId)
    failed.status = 'failed'
    await writeProject(failed)
    await appendEvent({
      projectId,
      runId,
      type: 'run.failed',
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function runChapterLoop(
  project: NovelProject,
  runId: string,
  mode: RunMode,
  requestedChapterIndex: number | undefined,
  checkpoint: Awaited<ReturnType<typeof readCheckpoint>>,
): Promise<void> {
  const projectId = project.id
  const artifacts = await listArtifacts(projectId)
  const outlineArtifact = [...artifacts].reverse().find(a => a.stage === 'outline' && (a.status === 'approved' || a.status === 'draft'))
  if (!outlineArtifact) {
    throw new Error('Outline artifact not found; cannot start chapter loop.')
  }
  const chapterTitles = extractChapterTitles(outlineArtifact.markdown)
  const totalChapters = chapterTitles.length || 1

  const completedChapterStages = checkpoint?.completedChapterStages || []

  const isChapterStageDone = (stage: WorkflowStage, idx: number) =>
    completedChapterStages.some(c => c.stage === stage && c.chapterIndex === idx)

  // Find the pending chapter's scene_writing approval (older checkpoints may still resume here)
  const pendingApprovalArtifactId = checkpoint?.awaitingApprovalArtifactId
  if (pendingApprovalArtifactId) {
    const pendingArtifact = artifacts.find(a => a.id === pendingApprovalArtifactId)
    if (pendingArtifact?.stage === 'scene_writing' && pendingArtifact.chapterIndex !== undefined) {
      // Approved scene_writing — run chapter_editing + chapter_supervision for this chapter
      const idx = pendingArtifact.chapterIndex
      const title = chapterTitles[idx] ?? `第 ${idx + 1} 章`
      await runChapterPostStages(projectId, runId, idx, title, completedChapterStages)
      await markChapterStageComplete(projectId, runId, 'scene_writing', idx, totalChapters)
    }
  }

  if (mode === 'yolo') {
    // Run all remaining chapters
    for (let idx = 0; idx < totalChapters; idx += 1) {
      if (isChapterStageDone('chapter_supervision', idx)) {
        continue
      }
      const title = chapterTitles[idx] ?? `第 ${idx + 1} 章`
      if (!isChapterStageDone('scene_writing', idx)) {
        await runStage(projectId, runId, 'scene_writing', 'draft', 0, { chapterIndex: idx, chapterTitle: title })
      }
      await runChapterPostStages(projectId, runId, idx, title, completedChapterStages)
      await markChapterStageComplete(projectId, runId, 'chapter_supervision', idx, totalChapters)
    }
    // After all chapters, mark scene_writing complete and run post-chapter stages
    await mutateCheckpoint(projectId, cp => ({
      ...(cp ?? emptyCheckpoint(projectId)),
      completedStages: mergeCompletedStages(cp?.completedStages, chapterStages),
    }))
  }
  else {
    const postPendingIdx = (() => {
      for (let i = 0; i < totalChapters; i += 1) {
        if (isChapterStageDone('scene_writing', i) && !isChapterStageDone('chapter_supervision', i)) {
          return i
        }
      }
      return undefined
    })()

    if (postPendingIdx !== undefined) {
      const title = chapterTitles[postPendingIdx] ?? `第 ${postPendingIdx + 1} 章`
      await runChapterPostStages(projectId, runId, postPendingIdx, title, completedChapterStages)
      await markChapterStageComplete(projectId, runId, 'chapter_supervision', postPendingIdx, totalChapters)
      return
    }

    // step mode: run the next pending chapter's scene_writing
    const targetIdx = requestedChapterIndex ?? (() => {
      for (let i = 0; i < totalChapters; i += 1) {
        if (!isChapterStageDone('scene_writing', i)) return i
      }
      return undefined
    })()

    if (targetIdx === undefined) {
      // All chapters done; mark complete so next step runs supervision
      await mutateCheckpoint(projectId, cp => ({
        ...(cp ?? emptyCheckpoint(projectId)),
        completedStages: mergeCompletedStages(cp?.completedStages, chapterStages),
      }))
      return
    }

    const title = chapterTitles[targetIdx] ?? `第 ${targetIdx + 1} 章`
    const artifact = await runStage(projectId, runId, 'scene_writing', 'needs_review', 0, { chapterIndex: targetIdx, chapterTitle: title })

    // Store totalChapters in checkpoint for UI
    await mutateCheckpoint(projectId, cp => ({
      ...(cp ?? emptyCheckpoint(projectId)),
      totalChapters,
      completedChapterStages: cp?.completedChapterStages ?? [],
    }))

    const refreshed = await readProject(projectId)
    refreshed.status = 'awaiting_review'
    refreshed.currentStage = 'scene_writing'
    await writeProject(refreshed)
    await appendEvent({
      projectId,
      runId,
      type: 'stage.awaiting_review',
      stage: 'scene_writing',
      agentId: artifact.agentId,
      status: 'needs_review',
      message: `${title} scene_writing awaiting review.`,
      payload: { artifactId: artifact.id, chapterIndex: targetIdx },
    })
  }
}

async function runChapterPostStages(
  projectId: string,
  runId: string,
  chapterIndex: number,
  chapterTitle: string,
  completedChapterStages: Array<{ stage: WorkflowStage; chapterIndex: number }>,
): Promise<void> {
  const isDone = (s: WorkflowStage) => completedChapterStages.some(c => c.stage === s && c.chapterIndex === chapterIndex)
  if (!isDone('chapter_editing')) {
    await runStage(projectId, runId, 'chapter_editing', 'draft', 0, { chapterIndex, chapterTitle })
    await mutateCheckpoint(projectId, cp => ({
      ...(cp ?? emptyCheckpoint(projectId)),
      completedChapterStages: mergeCompletedChapterStages(cp?.completedChapterStages, [{ stage: 'chapter_editing', chapterIndex }]),
    }))
  }
  if (!isDone('chapter_supervision')) {
    await runStage(projectId, runId, 'chapter_supervision', 'draft', 0, { chapterIndex, chapterTitle })
    await mutateCheckpoint(projectId, cp => ({
      ...(cp ?? emptyCheckpoint(projectId)),
      completedChapterStages: mergeCompletedChapterStages(cp?.completedChapterStages, [{ stage: 'chapter_supervision', chapterIndex }]),
    }))
  }
}

async function markChapterStageComplete(
  projectId: string,
  runId: string,
  stage: WorkflowStage,
  chapterIndex: number,
  totalChapters: number,
): Promise<void> {
  await mutateCheckpoint(projectId, cp => {
    const existing = cp?.completedChapterStages ?? []
    const alreadyDone = existing.some(c => c.stage === stage && c.chapterIndex === chapterIndex)
    return {
      ...(cp ?? emptyCheckpoint(projectId)),
      completedChapterStages: alreadyDone ? existing : [...existing, { stage, chapterIndex }],
    }
  })
  // If all chapters have chapter_supervision done, mark scene_writing complete in completedStages
  const cp = await readCheckpoint(projectId)
  const doneSupervisedCount = (cp?.completedChapterStages ?? []).filter(c => c.stage === 'chapter_supervision').length
  if (doneSupervisedCount >= totalChapters) {
    await mutateCheckpoint(projectId, c => ({
      ...(c ?? emptyCheckpoint(projectId)),
      completedStages: mergeCompletedStages(c?.completedStages, chapterStages),
    }))
    await appendEvent({ projectId, runId, type: 'stage.completed', stage: 'scene_writing', message: `All ${totalChapters} chapters completed.` })
  }
}

async function runProjectRevision(projectId: string, runId: string, revision: ProjectInputRevision): Promise<void> {
  const project = await readProject(projectId)
  const firstStage = revision.affectedStages[0]
  project.status = 'running'
  project.mode = 'yolo'
  project.currentStage = firstStage
  await writeProject(project)
  await appendEvent({
    projectId,
    runId,
    type: 'run.started',
    stage: firstStage,
    message: 'Project input revision run started.',
    payload: {
      changedFields: revision.changedFields.map(change => change.field),
      affectedStages: revision.affectedStages,
    },
  })

  try {
    await mutateCheckpoint(projectId, checkpoint => {
      const completedStages = new Set(checkpoint?.completedStages || [])
      for (const stage of revision.affectedStages) {
        completedStages.delete(stage)
      }
      return {
        projectId,
        runId,
        currentStage: firstStage,
        completedStages: Array.from(completedStages),
        awaitingApprovalArtifactId: undefined,
        updatedAt: new Date().toISOString(),
      }
    })

    await runYoloStages(project, runId, revision.affectedStages, revision.feedback)

    const refreshed = await readProject(projectId)
    refreshed.status = 'completed'
    refreshed.currentStage = undefined
    await writeProject(refreshed)
    await appendEvent({
      projectId,
      runId,
      type: 'run.completed',
      message: 'Project input revision run completed.',
      payload: {
        changedFields: revision.changedFields.map(change => change.field),
        affectedStages: revision.affectedStages,
      },
    })
  }
  catch (error) {
    const failed = await readProject(projectId)
    failed.status = 'failed'
    failed.currentStage = firstStage
    await writeProject(failed)
    await appendEvent({
      projectId,
      runId,
      type: 'run.failed',
      stage: firstStage,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      payload: { changedFields: revision.changedFields.map(change => change.field) },
    })
    throw error
  }
}

async function createPlannerReply(project: NovelProject, content: string): Promise<string> {
  const config = await readConfig()
  if (!config.deepSeekApiKey) {
    return [
      '需求确认专家：我已记录这条补充需求。',
      `当前项目是《${project.title}》。`,
      '如果题材、篇幅、视角、禁区和目标读者都已经明确，可以运行“单步运行”生成第一个需求确认产物；如果还不明确，请继续补充。',
    ].join('\n')
  }

  const deepseek = new DeepSeekClient(config)
  const result = await deepseek.createJson<{ reply: string }>({
    projectId: project.id,
    agentId: 'requirements_planner',
    messages: [
      {
        role: 'system',
        content: [
          'You are a requirements planner for a visual novel writing agent.',
          'Ask concise clarification questions only when they materially change the writing plan.',
          'Return only JSON: {"reply": "..."}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({ project, userMessage: content }),
      },
    ],
    reasoningEffort: 'high',
  })
  await appendConversation(project.id, 'requirements_planner', { messages: result.messages, toolCalls: result.toolCalls })
  return result.content.reply
}

async function runYoloStages(
  project: NovelProject,
  runId: string,
  stages: WorkflowStage[],
  feedback?: string,
): Promise<void> {
  const reviewLoopStages = new Set<WorkflowStage>(['outline_review', 'worldbuilding_review', 'characters_review', 'story_background_review'])
  for (const stage of stages) {
    if (reviewLoopStages.has(stage)) {
      await runContentReviewLoop(project.id, runId, stage)
    }
    else {
      await runStage(project.id, runId, stage, 'draft', 0, { feedback })
    }
  }
}

async function acceptPendingReviewForYolo(projectId: string, runId: string): Promise<void> {
  const checkpoint = await readCheckpoint(projectId)
  if (!checkpoint?.awaitingApprovalArtifactId) {
    return
  }

  const artifacts = await listArtifacts(projectId)
  const artifact = artifacts.find(item => item.id === checkpoint.awaitingApprovalArtifactId)
  if (!artifact || artifact.status !== 'needs_review') {
    return
  }

  await updateArtifactStatus(projectId, artifact.id, 'approved')
  await mutateCheckpoint(projectId, current => {
    const completedStages = new Set(current?.completedStages || [])
    // For chapter scene_writing, don't mark the stage globally complete yet
    if (artifact.stage !== 'scene_writing') {
      completedStages.add(artifact.stage)
    }
    return {
      ...current,
      projectId,
      runId,
      currentStage: artifact.stage,
      completedStages: workflowOrder.filter(stage => completedStages.has(stage)),
      completedChapterStages: artifact.stage === 'scene_writing' && artifact.chapterIndex !== undefined
        ? mergeCompletedChapterStages(current?.completedChapterStages, [{ stage: 'scene_writing', chapterIndex: artifact.chapterIndex }])
        : current?.completedChapterStages,
      awaitingApprovalArtifactId: undefined,
      updatedAt: new Date().toISOString(),
    }
  })
  await appendEvent({
    projectId,
    runId,
    type: 'approval.recorded',
    stage: artifact.stage,
    agentId: artifact.agentId,
    status: 'approved',
    message: `YOLO accepted pending ${stageTitle(artifact.stage)} artifact and continued.`,
    payload: { artifactId: artifact.id, action: 'yolo_continue' },
  })
}

async function runStepStages(project: NovelProject, runId: string, stages: WorkflowStage[]): Promise<void> {
  const stage = stages[0]
  if (!stage) {
    return
  }
  const artifact = await runStage(project.id, runId, stage, 'needs_review', 0)
  const refreshed = await readProject(project.id)
  refreshed.status = 'awaiting_review'
  refreshed.currentStage = stage
  await writeProject(refreshed)
  await appendEvent({
    projectId: project.id,
    runId,
    type: 'stage.awaiting_review',
    stage,
    agentId: artifact.agentId,
    status: 'needs_review',
    message: `${stageTitle(stage)} is awaiting review.`,
    payload: { artifactId: artifact.id },
  })
}

/** Maps a review stage to the stages it may re-run on failure. */
const reviewRevisionPlans: Partial<Record<WorkflowStage, WorkflowStage[]>> = {
  worldbuilding_review: ['worldbuilding'],
  characters_review: ['characters'],
  story_background_review: ['story_background'],
  outline_review: ['outline'],
}

const outlineCharacterRevisionPlan: WorkflowStage[] = ['characters', 'characters_review', 'story_background', 'story_background_review', 'outline']

async function runContentReviewLoop(projectId: string, runId: string, reviewStage: WorkflowStage): Promise<void> {
  const revisionStages = reviewRevisionPlans[reviewStage]
  if (!revisionStages?.length) {
    throw new Error(`No revision plan paired with review stage: ${reviewStage}`)
  }
  const project = await readProject(projectId)
  let lastReport: Partial<ReviewReport> | undefined
  for (let revisionLoop = 1; revisionLoop <= project.maxRevisionLoops; revisionLoop += 1) {
    const artifact = await runStage(projectId, runId, reviewStage, 'draft', revisionLoop)
    const report = artifact.json as Partial<ReviewReport>
    lastReport = report
    if (report.passed !== false) {
      return
    }
    await appendEvent({
      projectId,
      runId,
      type: 'stage.completed',
      stage: reviewStage,
      agentId: artifact.agentId,
      message: `${stageTitle(reviewStage)} requested revision loop ${revisionLoop}.`,
      payload: report,
    })
    await runRevisionPlan(
      projectId,
      runId,
      revisionPlanForReviewResult(reviewStage, report, revisionStages),
      revisionLoop,
      formatReviewRevisionFeedback(reviewStage, report, revisionLoop),
    )
  }
  throw new Error(`${stageTitle(reviewStage)} did not pass after ${project.maxRevisionLoops} revision loops: ${JSON.stringify(lastReport?.findings || [])}`)
}

function revisionPlanForReviewResult(
  reviewStage: WorkflowStage,
  report: Partial<ReviewReport>,
  fallbackPlan: WorkflowStage[],
): WorkflowStage[] {
  if (reviewStage === 'outline_review' && outlineReviewRequiresCharacterRevision(report)) {
    return outlineCharacterRevisionPlan
  }
  return fallbackPlan
}

function outlineReviewRequiresCharacterRevision(report: Partial<ReviewReport>): boolean {
  const findings = Array.isArray(report.findings) ? report.findings : []
  return findings.some(finding => {
    const text = `${finding.message} ${finding.suggestion}`.toLowerCase()
    return /角色|人物|配角|反派|家人|同伴|证人|联系人|阵营|character|cast|supporting|side character|antagonist|witness|family|contact|faction/.test(text)
  })
}

async function runRevisionPlan(
  projectId: string,
  runId: string,
  stages: WorkflowStage[],
  revisionLoop: number,
  feedback: string,
): Promise<void> {
  const reviewStages = new Set<WorkflowStage>(['outline_review', 'worldbuilding_review', 'characters_review', 'story_background_review'])
  for (const stage of stages) {
    if (reviewStages.has(stage)) {
      await runContentReviewLoop(projectId, runId, stage)
    }
    else {
      await runStage(projectId, runId, stage, 'draft', revisionLoop, { feedback })
    }
  }
}

function formatReviewRevisionFeedback(reviewStage: WorkflowStage, report: Partial<ReviewReport>, revisionLoop: number): string {
  const findings = Array.isArray(report.findings) ? report.findings : []
  return [
    `${stageTitle(reviewStage)} requested revision loop ${revisionLoop}.`,
    'Revise only the stages required by the review findings. Preserve approved compatible canon and avoid unrelated rewrites.',
    findings.length
      ? [
          'Review findings:',
          ...findings.map(finding => `- [${finding.severity}] ${finding.message} Suggestion: ${finding.suggestion}`),
        ].join('\n')
      : 'No structured findings were returned; improve the reviewed artifact according to the reviewer result.',
  ].join('\n')
}

async function runStage(
  projectId: string,
  runId: string,
  stage: WorkflowStage,
  status: ArtifactRef['status'],
  revisionLoop = 0,
  options: StageRunOptions = {},
): Promise<ArtifactRef> {
  const project = await readProject(projectId)
  const agent = getAgentForStage(stage)
  project.currentStage = stage
  project.status = 'running'
  await writeProject(project)
  await appendEvent({
    projectId,
    runId,
    type: 'stage.started',
    stage,
    agentId: agent.id,
    message: `${stageTitle(stage)} started.`,
  })

  const excludedArtifactIds = new Set(options.excludeArtifactIds || [])
  const previousArtifacts = (await listArtifacts(projectId)).filter(artifact => !excludedArtifactIds.has(artifact.id))
  const agentResult = await runAgent(project, runId, agent, previousArtifacts, [], revisionLoop, options.feedback, options.chapterIndex, options.chapterTitle)
  const combinedReferences = dedupeReferences(agentResult.references)
  const now = new Date().toISOString()
  const chapterLabel = options.chapterTitle ? ` · ${options.chapterTitle}` : options.chapterIndex !== undefined ? ` · 第 ${options.chapterIndex + 1} 章` : ''
  const artifact = await writeArtifact({
    id: artifactIdFor(stage),
    projectId,
    stage,
    agentId: agent.id,
    title: `${stageTitle(stage)}${chapterLabel}`,
    status,
    createdAt: now,
    updatedAt: now,
    json: agentResult.json,
    markdown: agentResult.markdown,
    references: combinedReferences,
    chapterIndex: options.chapterIndex,
  })

  await mutateCheckpoint(projectId, checkpoint => {
    const completedStages = new Set(checkpoint?.completedStages || [])
    if (status !== 'needs_review' && !chapterStages.includes(stage)) {
      completedStages.add(stage)
    }
    return {
      ...checkpoint,
      projectId,
      runId,
      currentStage: stage,
      completedStages: workflowOrder.filter(item => completedStages.has(item)),
      awaitingApprovalArtifactId: status === 'needs_review' ? artifact.id : undefined,
      updatedAt: now,
    }
  })
  await appendEvent({
    projectId,
    runId,
    type: 'stage.completed',
    stage,
    agentId: agent.id,
    status,
    message: `${stageTitle(stage)} completed.`,
    payload: { artifactId: artifact.id, references: combinedReferences.length },
  })
  return artifact
}

async function mutateCheckpoint(
  projectId: string,
  update: (checkpoint: Awaited<ReturnType<typeof readCheckpoint>>) => Awaited<ReturnType<typeof readCheckpoint>>,
): Promise<void> {
  const previous = checkpointLocks.get(projectId) || Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    const current = await readCheckpoint(projectId)
    const updated = update(current)
    if (updated) {
      await writeCheckpoint(updated)
    }
  })
  const tracked = next.finally(() => {
    if (checkpointLocks.get(projectId) === tracked) {
      checkpointLocks.delete(projectId)
    }
  })
  checkpointLocks.set(projectId, tracked)
  await next
}

async function runAgent(
  project: NovelProject,
  runId: string,
  agent: AgentDefinition,
  previousArtifacts: ArtifactRef[],
  references: SearchReference[],
  revisionLoop: number,
  regenerationFeedback?: string,
  chapterIndex?: number,
  chapterTitle?: string,
): Promise<{ json: unknown, markdown: string, references: SearchReference[] }> {
  const config = await readConfig()
  if (!config.deepSeekApiKey) {
    return { ...fallbackArtifact(project, agent, previousArtifacts, references, revisionLoop), references: [] }
  }

  const deepseek = new DeepSeekClient(config)
  const skills = await loadAgentSkills(agent)
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: [
        `You are ${agent.title}.`,
        'Return only valid JSON. The JSON must contain "markdown" and "data".',
        'The markdown must be visual novel writing, not QuaScript.',
        'Do not skip the workflow stage even when the user supplied advanced seed fields; process those fields through the current specialist role.',
        'Apply the seed modification policy and any user-provided section-specific advanced-input modification instructions exactly when using user-provided worldbuilding, character information, and outline.',
        'If project.seed contains worldbuildingModificationInstructions, charactersModificationInstructions, or outlineModificationInstructions, treat each as instructions for refining that corresponding supplied advanced input before deriving the current-stage artifact.',
        'When compacting context, never omit or contradict pinned project canon; preserve it before generated summaries.',
        'If regenerationFeedback is present, regenerate the current stage from canon and current approved context, applying that feedback without copying the rejected draft.',
        'If regenerationFeedback describes a project input revision, revise existing artifacts surgically: preserve compatible prior content, change only affected details and downstream dependencies, and do not restart from a blank slate.',
        stageOutputInstruction(agent.stage),
        searchPolicyInstruction(agent),
        seedPolicyInstruction(project),
        reviewPolicyInstruction(agent.stage, project),
        skills,
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        project: {
          title: project.title,
          brief: project.brief,
          mode: project.mode,
          seed: project.seed,
        },
        advancedInputModificationInstructions: formatSeedModificationInstructions(project.seed),
        stage: agent.stage,
        revisionLoop,
        regenerationFeedback,
        chapterIndex,
        chapterTitle,
        references,
        pinnedProjectCanon: formatPinnedProjectCanon(project),
        context: compactArtifacts(previousArtifacts, 12000, project),
      }),
    },
  ]
  const tavily = new TavilySearchTool(config)
  const tools: RegisteredDeepSeekTool[] = config.tavilyApiKey
    ? [
        {
          definition: tavily.definition(),
          execute: async input => {
            const result = await tavily.search(input as TavilySearchInput)
            await appendEvent({
              projectId: project.id,
              type: 'tool.called',
              stage: agent.stage,
              agentId: agent.id,
              message: 'Agent requested Tavily search.',
              payload: { input, references: result.references.length },
            })
            return result
          },
        },
      ]
    : []

  let result: DeepSeekRunResult<{ markdown: string, data: unknown }>
  try {
    result = await deepseek.createJson<{ markdown: string, data: unknown }>({
      messages,
      tools,
      agentId: agent.id,
      projectId: project.id,
      reasoningEffort: agent.reasoningEffort,
      onContentDelta: createStageContentStreamer(project.id, runId, agent),
    })
  }
  catch (error) {
    broadcastStageContentError({
      projectId: project.id,
      runId,
      stage: agent.stage,
      agentId: agent.id,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
  await appendConversation(project.id, agent.id, { messages: result.messages, toolCalls: result.toolCalls })
  const normalizedMarkdown = normalizeVisualNovelMarkdown(agent.stage, result.content.markdown)
  broadcastStageContentDone({
    projectId: project.id,
    runId,
    stage: agent.stage,
    agentId: agent.id,
    markdown: normalizedMarkdown,
  })
  return {
    json: normalizeAgentData(agent.stage, result.content.data, revisionLoop),
    markdown: normalizedMarkdown,
    references: extractToolReferences(result.toolCalls),
  }
}

function createStageContentStreamer(projectId: string, runId: string, agent: AgentDefinition) {
  let raw = ''
  return ({ content, sequence }: { content: string, sequence: number }) => {
    raw += content
    broadcastStageContentDelta({
      projectId,
      runId,
      stage: agent.stage,
      agentId: agent.id,
      sequence,
      delta: content,
      markdownPreview: extractMarkdownPreviewFromJsonStream(raw),
    })
  }
}

function extractMarkdownPreviewFromJsonStream(raw: string): string | undefined {
  const key = /"markdown"\s*:\s*"/.exec(raw)
  if (!key) {
    return undefined
  }

  let output = ''
  let escaping = false
  for (let index = key.index + key[0].length; index < raw.length; index += 1) {
    const char = raw[index]
    if (escaping) {
      output += decodeJsonStringEscape(char)
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (char === '"') {
      break
    }
    output += char
  }
  return output
}

function debugWorkflow(message: string, details: Record<string, unknown> = {}): void {
  if (process.env.NOVEL_WRITER_DEBUG !== '1' && process.env.NODE_ENV !== 'development') {
    return
  }
  console.info(`[novel-writer:workflow] ${message}`, details)
}

function decodeJsonStringEscape(char: string): string {
  const escapes: Record<string, string> = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  }
  return escapes[char] ?? char
}

function fallbackArtifact(
  project: NovelProject,
  agent: AgentDefinition,
  previousArtifacts: ArtifactRef[],
  references: SearchReference[],
  revisionLoop: number,
): { json: unknown, markdown: string } {
  const contextNote = previousArtifacts.length > 0
    ? `已参考 ${previousArtifacts.length} 个已生成产物。`
    : '这是项目的第一个结构化产物。'
  const referenceNote = references.length > 0
    ? `已收集 ${references.length} 条搜索引用。`
    : '尚未配置 Tavily 或未获得引用。'
  const seedNote = formatSeedNote(project)

  if (agent.stage === 'outline_review' || agent.stage === 'worldbuilding_review' || agent.stage === 'characters_review' || agent.stage === 'story_background_review') {
    return {
      json: { passed: true, findings: [], revisionLoop } satisfies ReviewReport,
      markdown: `# ${stageTitle(agent.stage)}\n\n评审结论：通过。\n\n循环次数：${revisionLoop}`,
    }
  }

  if (agent.stage === 'requirements') {
    return {
      json: {
        title: '需求确认',
        agentId: agent.id,
        seedPolicy: project.seed?.allowExpertChanges ? 'mutable' : 'immutable',
        revisionLoop,
      },
      markdown: [
        '# 需求确认',
        '',
        `项目：${project.title}`,
        '',
        '## 创作目标',
        project.brief,
        '',
        '## 高级输入处理策略',
        seedNote || '未提供高级输入，将从原始需求开始构建。',
        '',
        '## 后续流程',
        '世界观构建 -> 角色设定 -> 故事背景确定 -> 小说大纲 -> 大纲评审 -> 正文写作 -> 编辑润色 -> 写作监督 -> 最终成品。',
      ].join('\n'),
    }
  }

  if (agent.stage === 'scene_writing') {
    return {
      json: {
        sceneCount: 1,
        format: 'visual-novel-dialogue',
      },
      markdown: [
        '# 正文场景',
        seedNote ? `${seedNote}\n` : '',
        '',
        '旁白：夜色压低了窗外的城市噪声，所有未说出口的秘密都像停在玻璃上的雨。',
        '',
        '主角：如果我们现在回头，真相就会替别人活下去。',
        '',
        '同伴：那就往前走。至少这一次，让选择属于我们。',
      ].join('\n'),
    }
  }

  return {
    json: {
      title: stageTitle(agent.stage),
      agentId: agent.id,
      summary: `${agent.title} generated a scaffold artifact.`,
      references: references.length,
      revisionLoop,
    },
    markdown: [
      `# ${stageTitle(agent.stage)}`,
      '',
      `项目：${project.title}`,
      '',
      `原始需求：${project.brief}`,
      '',
      seedNote,
      seedNote ? '' : undefined,
      contextNote,
      referenceNote,
      '',
      '后续配置 DeepSeek API Key 后，此阶段会由对应专家 agent 生成完整内容。',
    ].filter(line => line !== undefined).join('\n'),
  }
}

function stageOutputInstruction(stage: WorkflowStage): string {
  const common = [
    'Final response must be exactly one JSON object with keys "markdown" and "data".',
    'Markdown may use headings and lists for planning stages. Only scene_writing/editing/final should contain substantial finished visual-novel prose.',
    'Finished prose format must be visual-novel transcript lines. Use either 旁白：叙述内容 or 角色名：台词内容.',
    'The speaker label before ： must contain only the canonical character name or 旁白. Never put actions, expressions, emotions, camera notes, clothing, location, or stage directions in the speaker label.',
    'If a line needs acting or emotional direction, put it after the colon or in a separate 旁白： line. Correct example: 璃央：（压低声音）别动。 Wrong example: 璃央（压低声音）：别动。',
  ]
  const instructions: Record<WorkflowStage, string[]> = {
    requirements: [
      'Current stage: requirements confirmation.',
      'Do not write the story manuscript in this stage.',
      'Summarize the original request, immutable/mutable seed policy, missing assumptions, target output shape, and the exact workflow plan.',
      'data should include: {stage:"requirements", confirmedRequirements:string[], seedPolicy:"immutable"|"mutable"|"none", workflow:string[], openQuestions:string[]}.',
    ],
    worldbuilding: [
      'Current stage: worldbuilding specialist.',
      'Build a coherent setting bible from the brief and seed worldbuilding. Apply seed.worldbuildingModificationInstructions to the supplied worldbuilding before expanding it. Do not skip this because seed worldbuilding exists.',
      'Separate immutable canon, expandable details, social systems, technology limits, daily-life texture, locations, conflict engines, and reference notes.',
    ],
    worldbuilding_review: [
      'Current stage: worldbuilding reviewer.',
      'Review the worldbuilding artifact for internal consistency, completeness, dramatic usability, and seed compliance.',
      'data must be exactly: {passed:boolean, findings:[{severity:"info"|"warning"|"blocker", message:string, suggestion:string}], revisionLoop:number}.',
    ],
    characters: [
      'Current stage: character design specialist.',
      'Build a character bible from the brief, seed characters, and approved worldbuilding. Apply seed.charactersModificationInstructions to the supplied character notes before expanding them. Do not skip this because seed character notes exist.',
      'If regenerationFeedback or review feedback from outline_review says the outline needs additional supporting or side characters, add the necessary character entries while preserving compatible established major characters.',
      'Cover each major character: role, desire, wound, contradiction, arc, relationships, speech pattern, appearance, clothing, family background, and continuity constraints.',
    ],
    characters_review: [
      'Current stage: character reviewer.',
      'Review the character design artifact for completeness (appearance, clothing, family, relationships, personality, arc) and seed compliance.',
      'data must be exactly: {passed:boolean, findings:[{severity:"info"|"warning"|"blocker", message:string, suggestion:string}], revisionLoop:number}.',
    ],
    story_background: [
      'Current stage: story background specialist.',
      'Convert worldbuilding and character material into the concrete historical, political, emotional, and scene-level background that the outline must use.',
      'Clarify past incidents, evidence chains, hidden records, faction pressures, and why the story starts now.',
    ],
    story_background_review: [
      'Current stage: story background reviewer.',
      'Review the story background artifact for causal clarity, faction specificity, emotional grounding, and seed compliance.',
      'data must be exactly: {passed:boolean, findings:[{severity:"info"|"warning"|"blocker", message:string, suggestion:string}], revisionLoop:number}.',
    ],
    outline: [
      'Current stage: outline writer.',
      'Generate a structured novel/visual-novel outline only after using requirements, worldbuilding, characters, and story background. Apply seed.outlineModificationInstructions to the supplied outline before expanding or revising it.',
      'The outline must expose routes, major choices, causality, escalation, required scenes, and ending conditions.',
      'Design visual-novel interactivity according to the original user request. Include choice points, option text, route/branch effects, state consequences, and ending branches when the premise calls for them.',
      'Do not force branches into a kinetic/linear story; if low interactivity is appropriate, state that explicitly and explain why. Otherwise, choices should affect relationships, information, danger, trust, route access, or endings.',
      'For each major choice, describe: where it appears, selectable options, immediate consequence, delayed payoff, and which route or ending it can influence.',
    ],
    outline_review: [
      'Current stage: entertainment outline reviewer.',
      'Review the latest outline from entertainment writing, causality, pacing, payoff, VN game-structure, and seed-consistency perspectives.',
      'Also review character coverage: if the outline needs supporting characters, side characters, antagonists, witnesses, family members, faction contacts, or route-specific characters that are missing or under-specified in the character bible, return blocker findings that request character-setting additions.',
      'When character additions are needed, make the finding actionable enough for the character specialist to add only the missing roles and then let the outline be regenerated from the updated character bible.',
      'Evaluate whether choice points, options, route branches, and ending branches match the original user request. Flag missing or fake choices when the requested experience implies interactive branching.',
      'If the outline is intentionally kinetic/linear, verify that the low-interactivity choice is justified by the user request and story design.',
      'Do not write or rewrite the manuscript here. Return actionable review findings.',
      'data must be exactly a ReviewReport shape: {passed:boolean, findings:[{severity:"info"|"warning"|"blocker", message:string, suggestion:string}], revisionLoop:number}.',
    ],
    scene_writing: [
      'Current stage: scene writer.',
      'If chapterIndex and chapterTitle are provided in the user message, write ONLY that specific chapter/scene from the outline.',
      'If no chapterIndex is provided, write the complete manuscript.',
      'Use visual-novel lines only: 旁白：叙述内容 and 角色名：台词内容.',
      'Narration must be emitted as 旁白： lines. Dialogue must be emitted as canonical character-name labels followed by ：.',
      'Do not write labels like 角色（微笑）, 角色[沉默], 角色-低声, or 角色/独白 before the colon. Move those details into the content after the colon or into a 旁白： line.',
    ],
    editing: [
      'Current stage: editor.',
      'Polish the written manuscript for clarity, rhythm, dialogue readability, emotional continuity, and VN reading flow.',
      'Preserve approved canon and route structure. Do not invent a new outline.',
      'While editing, normalize every finished scene line to 旁白：叙述内容 or 角色名：台词内容, and remove action/emotion descriptors from speaker labels.',
    ],
    supervision: [
      'Current stage: writing supervisor.',
      'Audit style consistency, seed usage, character voice, outline adherence, and original user requirements.',
      'Treat visual-novel transcript format violations as findings: narration should be 旁白：..., dialogue labels should be plain character names, and actions/emotions must not appear before the colon.',
      'Return supervisor findings in data when issues remain, and a corrected/polished markdown when possible.',
    ],
    chapter_editing: [
      'Current stage: per-chapter editor.',
      'Polish the scene writing for this specific chapter. Improve flow, pacing, and dialogue. Normalize format.',
      'While editing, normalize every finished scene line to 旁白：叙述内容 or 角色名：台词内容, and remove action/emotion descriptors from speaker labels.',
    ],
    chapter_supervision: [
      'Current stage: per-chapter supervisor.',
      'Audit this chapter for consistency with approved worldbuilding, characters, story background, and outline.',
      'Treat visual-novel transcript format violations as findings. Return any corrections inline in markdown.',
    ],
    final: [
      'Current stage: final context compactor and final deliverable.',
      'Produce the final deliverable and a compact canon summary that preserves pinned project canon before generated summaries.',
      'Do not omit seed details during compression.',
    ],
  }
  return [...common, ...instructions[stage]].join('\n')
}

function searchPolicyInstruction(agent: AgentDefinition): string {
  return [
    'Search policy: Tavily is available but must be used only when the current specialist decides external facts are materially needed.',
    'Use tavily_search for real-world scientific theory, city infrastructure, emergency response, AI governance, news/history references, or factual texture that affects plausibility.',
    'Do not search for project-internal canon, character names, already supplied seed details, or generic wording inspiration.',
    `If you search in this stage, prefer ${agent.searchDepth} depth and keep queries focused. If no external reference is needed, do not call the search tool.`,
  ].join('\n')
}

function normalizeAgentData(stage: WorkflowStage, data: unknown, revisionLoop: number): unknown {
  const isReviewStage = stage === 'outline_review' || stage === 'worldbuilding_review' || stage === 'characters_review' || stage === 'story_background_review'
  if (!isReviewStage) {
    return data
  }
  if (!data || typeof data !== 'object') {
    return { passed: true, findings: [], revisionLoop } satisfies ReviewReport
  }
  const source = data as Partial<ReviewReport>
  const findings: ReviewFinding[] = Array.isArray(source.findings)
    ? source.findings
        .filter(finding => finding && typeof finding === 'object')
        .map(finding => {
          const item = finding as unknown as Record<string, unknown>
          const severity: ReviewFinding['severity'] = item.severity === 'blocker' || item.severity === 'warning' || item.severity === 'info'
            ? item.severity
            : 'warning'
          return {
            severity,
            message: typeof item.message === 'string' ? item.message : '未命名评审问题。',
            suggestion: typeof item.suggestion === 'string' ? item.suggestion : '请根据评审意见修订。',
          }
        })
    : []
  const hasBlocker = findings.some(finding => finding.severity === 'blocker')
  return {
    passed: typeof source.passed === 'boolean' ? source.passed : !hasBlocker,
    findings,
    revisionLoop: typeof source.revisionLoop === 'number' ? source.revisionLoop : revisionLoop,
  } satisfies ReviewReport
}

function formatSeedNote(project: NovelProject): string {
  const fields = [
    project.seed?.worldbuilding ? '世界观' : undefined,
    project.seed?.worldbuildingModificationInstructions ? '世界观修改指示' : undefined,
    project.seed?.characters ? '角色信息' : undefined,
    project.seed?.charactersModificationInstructions ? '角色设定修改指示' : undefined,
    project.seed?.outline ? '大纲' : undefined,
    project.seed?.outlineModificationInstructions ? '大纲修改指示' : undefined,
    project.seed?.modificationInstructions ? '通用修改指示' : undefined,
  ].filter(Boolean)
  if (!fields.length) {
    return ''
  }
  const policy = project.seed?.allowExpertChanges
    ? '允许专家基于预设进行合理修改。'
    : '不允许专家修改预设内容和细节，只能丰富和完善。'
  const role = project.seed?.allowExpertChanges
    ? '这些信息会作为优先保留的项目基础参考参与后续专家生成与上下文压缩。'
    : '这些信息会作为固定项目 canon 参与后续专家生成与上下文压缩。'
  return `用户已预设基础信息：${fields.join('、')}。${role}${policy}`
}

function seedPolicyInstruction(project: NovelProject): string {
  if (!project.seed) {
    return 'No user-provided seed canon is present.'
  }
  const hasModificationInstructions = hasSeedModificationInstructions(project.seed)
  if (project.seed.allowExpertChanges) {
    return [
      'Seed modification policy: ALLOWED.',
      'You may modify user-provided seed details when it improves coherence, entertainment value, or feasibility.',
      hasModificationInstructions
        ? 'The user also provided section-specific advanced-input modification instructions. Apply each instruction first to its matching supplied seed material, then continue enriching it.'
        : '',
      'Every modification must remain grounded in the original seed and user brief, and should be explainable in the returned data.',
    ].filter(Boolean).join('\n')
  }
  return [
    'Seed modification policy: FORBIDDEN.',
    'All user-provided seed details are immutable canon.',
    hasModificationInstructions
      ? 'Exception: the user explicitly provided section-specific advanced-input modification instructions. Apply exactly those requested changes to the matching supplied seed material before enriching it; do not make additional unstated seed changes.'
      : '',
    'You may enrich, clarify, elaborate, and add compatible details, but you must not rewrite, remove, reverse, contradict, rename, or retcon any provided seed detail beyond explicit user modification instructions.',
  ].filter(Boolean).join('\n')
}

function reviewPolicyInstruction(stage: WorkflowStage, project: NovelProject): string {
  if (!project.seed || project.seed.allowExpertChanges) {
    return ''
  }
  const reviewStages: WorkflowStage[] = ['worldbuilding_review', 'characters_review', 'story_background_review', 'outline_review', 'supervision', 'editing']
  if (!reviewStages.includes(stage)) {
    return ''
  }
  return [
    'Review requirement: seed immutability is in scope.',
    'When reviewing or supervising, check whether the artifact contradicts, alters, omits, or weakens any immutable user-provided seed worldbuilding, character, or outline detail after applying any explicit user section-specific advanced-input modification instructions.',
    'If such a violation exists, return a blocker finding and do not pass the artifact until it is corrected.',
  ].join('\n')
}

function formatSeedModificationInstructions(seed: NovelProject['seed']): Record<string, string | undefined> | undefined {
  if (!seed || !hasSeedModificationInstructions(seed)) {
    return undefined
  }
  return {
    worldbuilding: seed.worldbuildingModificationInstructions,
    characters: seed.charactersModificationInstructions,
    outline: seed.outlineModificationInstructions,
    legacyGlobal: seed.modificationInstructions,
  }
}

function hasSeedModificationInstructions(seed: NonNullable<NovelProject['seed']>): boolean {
  return Boolean(
    seed.worldbuildingModificationInstructions
    || seed.charactersModificationInstructions
    || seed.outlineModificationInstructions
    || seed.modificationInstructions,
  )
}

export function extractToolReferences(toolCalls: Array<{ output?: unknown }>): SearchReference[] {
  const references: SearchReference[] = []
  for (const call of toolCalls) {
    const output = call.output
    if (output && typeof output === 'object' && 'references' in output && Array.isArray(output.references)) {
      references.push(...output.references.filter(isSearchReference))
    }
  }
  return dedupeReferences(references)
}

export function dedupeReferences(references: SearchReference[]): SearchReference[] {
  const seen = new Set<string>()
  return references.filter(reference => {
    const key = `${reference.source}:${reference.url}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function isSearchReference(value: unknown): value is SearchReference {
  return Boolean(
    value
    && typeof value === 'object'
    && 'source' in value
    && value.source === 'tavily'
    && 'url' in value
    && typeof value.url === 'string',
  )
}
