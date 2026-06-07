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
import { DeepSeekClient, type DeepSeekMessage, type RegisteredDeepSeekTool } from './deepseek'
import { TavilySearchTool, type TavilySearchInput } from './tavily'
import { normalizeVisualNovelMarkdown } from './visual-novel-format'
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
  /** For scene_writing: 0-based chapter index within the approved outline. */
  chapterIndex?: number
  chapterTitle?: string
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
  const run = runWorkflow(projectId, runId, requestedMode, chapterIndex).finally(() => {
    activeRuns.delete(projectId)
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

  if (input.action === 'regenerate') {
    const artifact = await updateArtifactStatus(projectId, input.artifactId, 'rejected')
    const project = await readProject(projectId)
    const runId = randomUUID()
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
  await appendEvent({
    projectId,
    type: 'approval.recorded',
    message: `Review action recorded: ${input.action}`,
    payload: input,
  })

  if (input.action === 'approve') {
    await mutateCheckpoint(projectId, checkpoint => {
      const completedStages = new Set(checkpoint?.completedStages || [])
      completedStages.add(artifact.stage)
      // Cascade: when a content stage is approved after manual edit, invalidate all downstream stages
      for (const downstream of stagesAfter(artifact.stage)) {
        completedStages.delete(downstream)
      }
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
    project.currentStage = undefined
    await writeProject(project)
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
    const completed = new Set((await readCheckpoint(projectId))?.completedStages || [])
    const stages = mode === 'step'
      ? [workflowOrder.find(stage => !completed.has(stage))].filter((stage): stage is WorkflowStage => Boolean(stage))
      : workflowOrder.filter(stage => !completed.has(stage))

    if (mode === 'yolo') {
      await runYoloStages(project, runId, stages, chapterIndex)
    }
    else {
      await runStepStages(project, runId, stages, chapterIndex)
    }

    const refreshed = await readProject(projectId)
    if (refreshed.status !== 'awaiting_review') {
      refreshed.status = 'completed'
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

    await runYoloStages(project, runId, revision.affectedStages, undefined, revision.feedback)

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
  chapterIndex?: number,
  feedback?: string,
): Promise<void> {
  const reviewLoopStages = new Set<WorkflowStage>(['outline_review', 'worldbuilding_review', 'characters_review', 'story_background_review'])
  for (const stage of stages) {
    if (reviewLoopStages.has(stage)) {
      await runContentReviewLoop(project.id, runId, stage)
    }
    else {
      await runStage(project.id, runId, stage, 'draft', 0, { chapterIndex, feedback })
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
    completedStages.add(artifact.stage)
    return {
      projectId,
      runId,
      currentStage: artifact.stage,
      completedStages: Array.from(completedStages),
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

async function runStepStages(project: NovelProject, runId: string, stages: WorkflowStage[], chapterIndex?: number): Promise<void> {
  const stage = stages[0]
  if (!stage) {
    return
  }
  const artifact = await runStage(project.id, runId, stage, 'needs_review', 0, { chapterIndex })
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

/** Maps a review stage to the content stage it validates (and re-runs on failure). */
const reviewStagePairs: Partial<Record<WorkflowStage, WorkflowStage>> = {
  worldbuilding_review: 'worldbuilding',
  characters_review: 'characters',
  story_background_review: 'story_background',
  outline_review: 'outline',
}

async function runContentReviewLoop(projectId: string, runId: string, reviewStage: WorkflowStage): Promise<void> {
  const contentStage = reviewStagePairs[reviewStage]
  if (!contentStage) {
    throw new Error(`No content stage paired with review stage: ${reviewStage}`)
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
    await runStage(projectId, runId, contentStage, 'draft', revisionLoop)
  }
  throw new Error(`${stageTitle(reviewStage)} did not pass after ${project.maxRevisionLoops} revision loops: ${JSON.stringify(lastReport?.findings || [])}`)
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
  const agentResult = await runAgent(project, agent, previousArtifacts, [], revisionLoop, options.feedback, options.chapterIndex, options.chapterTitle)
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
    if (status !== 'needs_review') {
      completedStages.add(stage)
    }
    return {
      projectId,
      runId,
      currentStage: stage,
      completedStages: Array.from(completedStages),
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
        'Apply the seed modification policy exactly when using user-provided worldbuilding, character information, and outline.',
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

  const result = await deepseek.createJson<{ markdown: string, data: unknown }>({
    messages,
    tools,
    agentId: agent.id,
    projectId: project.id,
    reasoningEffort: agent.reasoningEffort,
  })
  await appendConversation(project.id, agent.id, { messages: result.messages, toolCalls: result.toolCalls })
  return {
    json: normalizeAgentData(agent.stage, result.content.data, revisionLoop),
    markdown: normalizeVisualNovelMarkdown(agent.stage, result.content.markdown),
    references: extractToolReferences(result.toolCalls),
  }
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
      'Build a coherent setting bible from the brief and seed worldbuilding. Do not skip this because seed worldbuilding exists.',
      'Separate immutable canon, expandable details, social systems, technology limits, daily-life texture, locations, conflict engines, and reference notes.',
    ],
    worldbuilding_review: [
      'Current stage: worldbuilding reviewer.',
      'Review the worldbuilding artifact for internal consistency, completeness, dramatic usability, and seed compliance.',
      'data must be exactly: {passed:boolean, findings:[{severity:"info"|"warning"|"blocker", message:string, suggestion:string}], revisionLoop:number}.',
    ],
    characters: [
      'Current stage: character design specialist.',
      'Build a character bible from the brief, seed characters, and approved worldbuilding. Do not skip this because seed character notes exist.',
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
      'Generate a structured novel/visual-novel outline only after using requirements, worldbuilding, characters, and story background.',
      'The outline must expose routes, major choices, causality, escalation, required scenes, and ending conditions.',
      'Design visual-novel interactivity according to the original user request. Include choice points, option text, route/branch effects, state consequences, and ending branches when the premise calls for them.',
      'Do not force branches into a kinetic/linear story; if low interactivity is appropriate, state that explicitly and explain why. Otherwise, choices should affect relationships, information, danger, trust, route access, or endings.',
      'For each major choice, describe: where it appears, selectable options, immediate consequence, delayed payoff, and which route or ending it can influence.',
    ],
    outline_review: [
      'Current stage: entertainment outline reviewer.',
      'Review the latest outline from entertainment writing, causality, pacing, payoff, VN game-structure, and seed-consistency perspectives.',
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
    project.seed?.characters ? '角色信息' : undefined,
    project.seed?.outline ? '大纲' : undefined,
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
  if (project.seed.allowExpertChanges) {
    return [
      'Seed modification policy: ALLOWED.',
      'You may modify user-provided seed details when it improves coherence, entertainment value, or feasibility.',
      'Every modification must remain grounded in the original seed and user brief, and should be explainable in the returned data.',
    ].join('\n')
  }
  return [
    'Seed modification policy: FORBIDDEN.',
    'All user-provided seed details are immutable canon.',
    'You may enrich, clarify, elaborate, and add compatible details, but you must not rewrite, remove, reverse, contradict, rename, or retcon any provided seed detail.',
  ].join('\n')
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
    'When reviewing or supervising, check whether the artifact contradicts, alters, omits, or weakens any immutable user-provided seed worldbuilding, character, or outline detail.',
    'If such a violation exists, return a blocker finding and do not pass the artifact until it is corrected.',
  ].join('\n')
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
