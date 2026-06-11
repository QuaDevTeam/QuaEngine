import { access, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactRef } from '../src/lib/types'
import { appendJsonl, readJsonl } from '../src/lib/server/jsonl'
import { createMacSandboxProfile } from '../src/lib/server/sandbox'
import { normalizeTavilyReferences } from '../src/lib/server/tavily'
import { normalizeVisualNovelMarkdown } from '../src/lib/server/visual-novel-format'
import { applyProjectInputUpdate } from '../src/lib/server/project-input'
import { compactArtifacts, formatPinnedProjectCanon } from '../src/lib/server/context'
import { getAgentForStage, loadAgentSkills, workflowOrder } from '../src/lib/server/agents'
import {
  appendConversation,
  appendEvent,
  createProject,
  deleteTrashedProject,
  emptyTrash,
  listArtifacts,
  listTrashedProjects,
  readCheckpoint,
  readConfig,
  readEvents,
  readProject,
  resetProjectRuntimeData,
  restoreTrashedProject,
  trashProject,
  writeArtifact,
  writeCheckpoint,
  writeConfig,
} from '../src/lib/server/store'
import { getProjectRoot, getTrashedProjectRoot } from '../src/lib/server/paths'
import {
  broadcastStageContentDelta,
  broadcastStageContentDone,
  subscribeProjectRealtimeMessages,
} from '../src/lib/server/realtime.js'
import {
  appendUserMessage,
  dedupeReferences,
  extractToolReferences,
  isProjectRunning,
  recordApproval,
  startWorkflow,
} from '../src/lib/server/workflow'
import { buildStageTimeline } from '../src/lib/client/workspace'

let tempHome: string | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  if (tempHome) {
    await rm(tempHome, { recursive: true, force: true })
    tempHome = undefined
  }
  delete process.env.NOVEL_WRITER_HOME
  delete process.env.NOVEL_WRITER_SKILLS_DIR
})

describe('Tavily references', () => {
  it('normalizes result fields for artifact references', () => {
    const references = normalizeTavilyReferences('cyberpunk transit', [
      {
        title: 'Transit Research',
        url: 'https://example.com/transit',
        content: 'Urban mobility context',
        raw_content: '# Raw',
        score: 0.8,
        published_date: '2026-01-01',
      },
      {
        title: 'Missing URL',
      },
    ])

    expect(references).toHaveLength(1)
    expect(references[0]).toMatchObject({
      title: 'Transit Research',
      url: 'https://example.com/transit',
      query: 'cyberpunk transit',
      source: 'tavily',
    })
  })
})

describe('context compaction', () => {
  it('keeps the newest artifacts within budget', () => {
    const artifacts = ['world', 'characters', 'outline'].map((stage, index) => ({
      id: stage,
      projectId: 'p1',
      stage: 'outline',
      agentId: 'agent',
      title: stage,
      status: 'draft',
      createdAt: String(index),
      updatedAt: String(index),
      json: {},
      markdown: `${stage} markdown`.repeat(20),
      references: [],
    })) as ArtifactRef[]

    const compacted = compactArtifacts(artifacts, 600)
    expect(compacted).toContain('outline')
    expect(compacted.length).toBeLessThanOrEqual(600)
  })

  it('does not compact rejected artifacts back into agent context', () => {
    const artifacts = [
      {
        id: 'rejected',
        projectId: 'p1',
        stage: 'outline',
        agentId: 'agent',
        title: '旧大纲',
        status: 'rejected',
        createdAt: '0',
        updatedAt: '0',
        json: {},
        markdown: '这是一份已拒绝的旧稿。',
        references: [],
      },
      {
        id: 'approved',
        projectId: 'p1',
        stage: 'worldbuilding',
        agentId: 'agent',
        title: '世界观',
        status: 'approved',
        createdAt: '1',
        updatedAt: '1',
        json: {},
        markdown: '这是一份可继续沿用的设定。',
        references: [],
      },
    ] as ArtifactRef[]

    const compacted = compactArtifacts(artifacts, 1000)
    expect(compacted).toContain('这是一份可继续沿用的设定。')
    expect(compacted).not.toContain('这是一份已拒绝的旧稿。')
  })

  it('preserves project seed canon before generated artifacts', () => {
    const project = {
      id: 'p1',
      title: '种子项目',
      brief: '延续已有构思',
      mode: 'step',
      status: 'idle',
      createdAt: '0',
      updatedAt: '0',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '天空城市依靠潮汐水晶运行。',
        worldbuildingModificationInstructions: '把科技设定改得更日常，但保留潮汐水晶。',
        characters: '璃央：失忆的机械师。',
        charactersModificationInstructions: '让璃央和澪的搭档关系更有张力。',
        outline: '第一幕发现水晶枯竭。',
        outlineModificationInstructions: '第一幕结尾增加一次错误选择。',
        allowExpertChanges: false,
      },
    } as const
    const artifacts = [{
      id: 'old',
      projectId: 'p1',
      stage: 'outline',
      agentId: 'agent',
      title: 'old',
      status: 'draft',
      createdAt: '0',
      updatedAt: '0',
      json: {},
      markdown: 'generated artifact'.repeat(200),
      references: [],
    }] as ArtifactRef[]

    const compacted = compactArtifacts(artifacts, 120, project)
    expect(compacted).toContain('天空城市依靠潮汐水晶运行。')
    expect(compacted).toContain('璃央：失忆的机械师。')
    expect(compacted).toContain('第一幕发现水晶枯竭。')
    expect(compacted).toContain('把科技设定改得更日常，但保留潮汐水晶。')
    expect(compacted).toContain('让璃央和澪的搭档关系更有张力。')
    expect(compacted).toContain('第一幕结尾增加一次错误选择。')
    expect(compacted).toContain('允许专家修改设定：关闭')
    expect(compacted).toContain('内容和细节不可修改')
    expect(compacted).not.toContain('generated artifact')
  })

  it('records when experts may modify seed details', () => {
    const project = {
      id: 'p1',
      title: '可改设定',
      brief: '允许专家调整',
      mode: 'step',
      status: 'idle',
      createdAt: '0',
      updatedAt: '0',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '旧城。',
        allowExpertChanges: true,
      },
    } as const

    const canon = formatPinnedProjectCanon(project)
    expect(canon).toContain('允许专家修改设定：开启')
    expect(canon).toContain('可以以用户预设为基础进行合理修改')
    expect(canon).toContain('可按修改策略合理调整')
  })
})

describe('sandbox profile', () => {
  it('escapes project roots in the macOS sandbox profile', () => {
    const profile = createMacSandboxProfile(['/tmp/project "quoted"'])
    expect(profile).toContain('/tmp/project \\"quoted\\"')
    expect(profile).toContain('(allow network*)')
  })
})

describe('local storage', () => {
  it('writes config and project records under NOVEL_WRITER_HOME', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-'))
    process.env.NOVEL_WRITER_HOME = tempHome

    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })

    const config = await readConfig()
    expect(config.defaultMaxRevisionLoops).toBe(50)

    const project = await createProject({
      title: '测试项目',
      brief: '生成一个视觉小说测试项目',
      mode: 'step',
      seed: {
        worldbuilding: '雨城由七座桥连接。',
        worldbuildingModificationInstructions: '桥梁设定更生活化。',
        characters: '澪：桥梁管理员。',
        charactersModificationInstructions: '角色关系更暧昧。',
        outline: '桥断之后开始调查。',
        outlineModificationInstructions: '结尾保留开放式余韵。',
        allowExpertChanges: true,
      },
    })
    expect(project.maxRevisionLoops).toBe(50)
    expect(project.seed?.worldbuilding).toBe('雨城由七座桥连接。')
    expect(project.seed?.worldbuildingModificationInstructions).toBe('桥梁设定更生活化。')
    expect(project.seed?.charactersModificationInstructions).toBe('角色关系更暧昧。')
    expect(project.seed?.outlineModificationInstructions).toBe('结尾保留开放式余韵。')
    expect(project.seed?.allowExpertChanges).toBe(true)
    await expect(readProject(project.id)).resolves.toMatchObject({
      seed: {
        characters: '澪：桥梁管理员。',
        outline: '桥断之后开始调查。',
        worldbuildingModificationInstructions: '桥梁设定更生活化。',
        charactersModificationInstructions: '角色关系更暧昧。',
        outlineModificationInstructions: '结尾保留开放式余韵。',
        allowExpertChanges: true,
      },
    })
  })

  it('round-trips JSONL records', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-jsonl-'))
    const filePath = join(tempHome, 'events.jsonl')
    await appendJsonl(filePath, { id: 1 })
    await appendJsonl(filePath, { id: 2 })
    await expect(readJsonl<{ id: number }>(filePath)).resolves.toEqual([{ id: 1 }, { id: 2 }])
  })

  it('moves projects through trash before deleting files permanently', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-delete-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '删除测试',
      brief: '测试删除项目目录',
      mode: 'step',
    })
    await writeArtifact({
      id: 'requirements',
      projectId: project.id,
      stage: 'requirements',
      agentId: 'requirements_planner',
      title: '需求确认',
      status: 'draft',
      createdAt: '0',
      updatedAt: '0',
      json: {},
      markdown: '需求',
      references: [],
    })

    await expect(access(getProjectRoot(project.id))).resolves.toBeUndefined()
    const trashedProject = await trashProject(project.id)
    expect(trashedProject.trashedAt).toBeTruthy()
    await expect(access(getProjectRoot(project.id))).rejects.toThrow()
    await expect(access(getTrashedProjectRoot(project.id))).resolves.toBeUndefined()
    await expect(listTrashedProjects()).resolves.toEqual([
      expect.objectContaining({ id: project.id, trashedAt: expect.any(String) }),
    ])

    const restoredProject = await restoreTrashedProject(project.id)
    expect(restoredProject.trashedAt).toBeUndefined()
    await expect(access(getProjectRoot(project.id))).resolves.toBeUndefined()
    await expect(access(getTrashedProjectRoot(project.id))).rejects.toThrow()

    await trashProject(project.id)
    await deleteTrashedProject(project.id)
    await expect(access(getProjectRoot(project.id))).rejects.toThrow()
    await expect(access(getTrashedProjectRoot(project.id))).rejects.toThrow()

    const projectForEmptyTrash = await createProject({
      title: '清空回收站测试',
      brief: '测试清空回收站。',
      mode: 'step',
    })
    await trashProject(projectForEmptyTrash.id)
    await expect(access(getTrashedProjectRoot(projectForEmptyTrash.id))).resolves.toBeUndefined()
    await emptyTrash()
    await expect(access(getTrashedProjectRoot(projectForEmptyTrash.id))).rejects.toThrow()
  })

  it('clears project runtime data while preserving editable project input', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-reset-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 9,
    })
    const project = await createProject({
      title: '重置测试',
      brief: '清空已有运行数据后重新开始。',
      mode: 'yolo',
      maxRevisionLoops: 7,
      seed: {
        worldbuilding: '旧城靠潮汐钟运行。',
        characters: '璃央：钟表师。',
        outline: '第一幕钟楼停摆。',
        outlineModificationInstructions: '让结尾更克制。',
        allowExpertChanges: false,
      },
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'outline-old',
      projectId: project.id,
      stage: 'outline',
      agentId: 'outline_writer',
      title: '旧大纲',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      json: { old: true },
      markdown: '# 旧大纲',
      references: [],
    })
    await appendConversation(project.id, 'requirements_planner', {
      role: 'assistant',
      content: '旧对话',
    })
    await appendEvent({
      projectId: project.id,
      type: 'stage.started',
      stage: 'outline',
      agentId: 'outline_writer',
      message: 'Old outline started.',
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'old-run',
      currentStage: 'outline',
      completedStages: ['requirements', 'worldbuilding'],
      updatedAt: now,
    })

    const projectRoot = getProjectRoot(project.id)
    const conversationPath = join(projectRoot, 'conversations', 'requirements_planner.jsonl')
    await expect(access(conversationPath)).resolves.toBeUndefined()
    expect(await listArtifacts(project.id)).toHaveLength(1)
    expect(await readCheckpoint(project.id)).toMatchObject({ currentStage: 'outline' })
    expect(await readEvents(project.id)).not.toEqual([])

    const resetProject = await resetProjectRuntimeData(project.id)

    expect(resetProject).toMatchObject({
      id: project.id,
      title: '重置测试',
      brief: '清空已有运行数据后重新开始。',
      mode: 'yolo',
      status: 'idle',
      maxRevisionLoops: 7,
      seed: {
        worldbuilding: '旧城靠潮汐钟运行。',
        characters: '璃央：钟表师。',
        outline: '第一幕钟楼停摆。',
        outlineModificationInstructions: '让结尾更克制。',
        allowExpertChanges: false,
      },
    })
    expect(resetProject.currentStage).toBeUndefined()
    expect(await listArtifacts(project.id)).toEqual([])
    expect(await readEvents(project.id)).toEqual([])
    expect(await readCheckpoint(project.id)).toBeUndefined()
    await expect(access(conversationPath)).rejects.toThrow()
    await expect(access(join(projectRoot, 'artifacts'))).resolves.toBeUndefined()
    await expect(access(join(projectRoot, 'conversations'))).resolves.toBeUndefined()
    await expect(access(join(projectRoot, 'snapshots'))).resolves.toBeUndefined()
  })

  it('restarts from requirements after a reset', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-reset-restart-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '重启测试',
      brief: '重置后应从需求确认重新开始。',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'final-old',
      projectId: project.id,
      stage: 'final',
      agentId: 'final_packager',
      title: '旧终稿',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '# 旧终稿',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'old-run',
      currentStage: 'final',
      completedStages: workflowOrder,
      updatedAt: now,
    })

    const resetProject = await resetProjectRuntimeData(project.id)
    await startWorkflow(project.id, resetProject.mode)
    while (isProjectRunning(project.id)) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    const artifacts = await listArtifacts(project.id)
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    const events = await readEvents(project.id)
    expect(events[0]?.type).toBe('run.started')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      stage: 'requirements',
      status: 'needs_review',
    })
    expect(checkpoint).toMatchObject({
      currentStage: 'requirements',
      completedStages: [],
      awaitingApprovalArtifactId: artifacts[0].id,
    })
    expect(refreshedProject.status).toBe('awaiting_review')
    expect(refreshedProject.currentStage).toBe('requirements')
  })
})

describe('realtime SSE messages', () => {
  it('broadcasts persisted workflow events and streamed content over the project realtime channel', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-realtime-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    const project = await createProject({
      title: '实时通道测试',
      brief: '测试 SSE 状态和内容流。',
      mode: 'step',
    })
    const received: unknown[] = []
    const unsubscribe = subscribeProjectRealtimeMessages(project.id, message => {
      received.push(message)
    })

    try {
      await appendEvent({
        projectId: project.id,
        type: 'stage.started',
        stage: 'worldbuilding',
        agentId: 'worldbuilding_expert',
        message: 'Worldbuilding started.',
      })
      broadcastStageContentDelta({
        projectId: project.id,
        runId: 'run-1',
        stage: 'worldbuilding',
        agentId: 'worldbuilding_expert',
        sequence: 1,
        delta: '{"markdown":"# 世界观',
        markdownPreview: '# 世界观',
      })
      broadcastStageContentDone({
        projectId: project.id,
        runId: 'run-1',
        stage: 'worldbuilding',
        agentId: 'worldbuilding_expert',
        markdown: '# 世界观\n\n旁白：雨落在城市边界。',
      })
    }
    finally {
      unsubscribe()
    }

    expect((await readEvents(project.id)).some(event => event.type === 'stage.started')).toBe(true)
    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'workflow.event',
          event: expect.objectContaining({ type: 'stage.started', stage: 'worldbuilding' }),
        }),
        expect.objectContaining({
          type: 'stage.content.delta',
          markdownPreview: '# 世界观',
        }),
        expect.objectContaining({
          type: 'stage.content.done',
          markdown: '# 世界观\n\n旁白：雨落在城市边界。',
        }),
      ]),
    )
  })
})

describe('project input updates', () => {
  it('detects unchanged project input without affected stages', () => {
    const project = {
      id: 'p1',
      title: '旧标题',
      brief: '原始需求',
      mode: 'step',
      status: 'idle',
      createdAt: '0',
      updatedAt: '0',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '旧世界',
        worldbuildingModificationInstructions: '旧世界修改',
        characters: '旧角色',
        charactersModificationInstructions: '旧角色修改',
        outline: '旧大纲',
        outlineModificationInstructions: '旧大纲修改',
        allowExpertChanges: false,
      },
    } as const

    const result = applyProjectInputUpdate(project, {
      title: '旧标题',
      brief: '原始需求',
      mode: 'step',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '旧世界',
        worldbuildingModificationInstructions: '旧世界修改',
        characters: '旧角色',
        charactersModificationInstructions: '旧角色修改',
        outline: '旧大纲',
        outlineModificationInstructions: '旧大纲修改',
        allowExpertChanges: false,
      },
    })

    expect(result.revision.changedFields).toEqual([])
    expect(result.revision.affectedStages).toEqual([])
  })

  it('starts downstream revision from the earliest changed creative field', () => {
    const project = {
      id: 'p1',
      title: '旧标题',
      brief: '原始需求',
      mode: 'step',
      status: 'idle',
      createdAt: '0',
      updatedAt: '0',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '旧世界',
        characters: '旧角色',
        outline: '旧大纲',
        charactersModificationInstructions: '',
        allowExpertChanges: false,
      },
    } as const

    const result = applyProjectInputUpdate(project, {
      title: '新标题',
      brief: '原始需求',
      mode: 'step',
      maxRevisionLoops: 50,
      seed: {
        worldbuilding: '旧世界',
        characters: '新角色',
        outline: '旧大纲',
        charactersModificationInstructions: '把角色关系统一成更悬疑的方向。',
        allowExpertChanges: false,
      },
    })

    expect(result.revision.changedFields.map(change => change.field)).toEqual(['title', 'seed.characters', 'seed.charactersModificationInstructions'])
    expect(result.revision.changedFields.find(change => change.field === 'title')?.affectsContent).toBe(false)
    expect(result.revision.affectedStages[0]).toBe('characters')
    expect(result.revision.affectedStages).toContain('final')
    expect(result.revision.feedback).toContain('Only change the parts required')
    expect(result.revision.feedback).toContain('角色设定修改指示')
  })
})

describe('approval workflow', () => {
  it('does not mark a step artifact complete until approval is recorded', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-approval-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '审批测试',
      brief: '测试单步审批状态',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'requirements-review',
      projectId: project.id,
      stage: 'requirements',
      agentId: 'requirements_planner',
      title: '需求确认',
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '旁白：等待确认。',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'run-1',
      currentStage: 'requirements',
      completedStages: [],
      awaitingApprovalArtifactId: 'requirements-review',
      updatedAt: now,
    })

    await recordApproval(project.id, { artifactId: 'requirements-review', action: 'approve' })

    const artifact = (await listArtifacts(project.id))[0]
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    expect(artifact.status).toBe('approved')
    expect(checkpoint?.completedStages).toEqual(['requirements'])
    expect(checkpoint?.awaitingApprovalArtifactId).toBeUndefined()
    expect(refreshedProject.status).toBe('idle')
    expect(refreshedProject.currentStage).toBeUndefined()
  })

  it('keeps a rejected stage incomplete for the next step run', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-reject-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '退回测试',
      brief: '测试退回后继续生成',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'outline-review',
      projectId: project.id,
      stage: 'outline',
      agentId: 'outline_writer',
      title: '小说大纲',
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '旁白：还需要修改。',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'run-1',
      currentStage: 'outline',
      completedStages: ['requirements', 'worldbuilding', 'characters', 'story_background', 'outline'],
      awaitingApprovalArtifactId: 'outline-review',
      updatedAt: now,
    })

    await recordApproval(project.id, {
      artifactId: 'outline-review',
      action: 'request_changes',
      note: '转折太弱。',
    })

    const artifact = (await listArtifacts(project.id))[0]
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    expect(artifact.status).toBe('rejected')
    expect(checkpoint?.completedStages).not.toContain('outline')
    expect(checkpoint?.awaitingApprovalArtifactId).toBeUndefined()
    expect(refreshedProject.currentStage).toBe('outline')
  })

  it('regenerates a review artifact immediately and awaits review on the new artifact', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-regenerate-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '重生成测试',
      brief: '测试点击重生成后立即重新生成当前阶段',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'outline-review',
      projectId: project.id,
      stage: 'outline',
      agentId: 'outline_writer',
      title: '小说大纲',
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '旁白：旧大纲。',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'run-1',
      currentStage: 'outline',
      completedStages: ['requirements', 'worldbuilding', 'characters', 'story_background', 'outline'],
      awaitingApprovalArtifactId: 'outline-review',
      updatedAt: now,
    })

    await recordApproval(project.id, {
      artifactId: 'outline-review',
      action: 'regenerate',
      note: '路线分歧需要更清晰。',
    })
    expect(isProjectRunning(project.id)).toBe(true)
    while (isProjectRunning(project.id)) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    const artifacts = await listArtifacts(project.id)
    const oldArtifact = artifacts.find(artifact => artifact.id === 'outline-review')
    const newArtifact = artifacts.find(artifact => artifact.id !== 'outline-review' && artifact.stage === 'outline')
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    expect(oldArtifact?.status).toBe('rejected')
    expect(newArtifact?.status).toBe('needs_review')
    expect(newArtifact?.id).not.toBe('outline-review')
    expect(checkpoint?.completedStages).not.toContain('outline')
    expect(checkpoint?.awaitingApprovalArtifactId).toBe(newArtifact?.id)
    expect(refreshedProject.status).toBe('awaiting_review')
    expect(refreshedProject.currentStage).toBe('outline')
  })

  it('keeps a manually edited artifact awaiting review', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-manual-edit-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '手动编辑测试',
      brief: '测试保存修改后仍处于待审',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'scene-review',
      projectId: project.id,
      stage: 'scene_writing',
      agentId: 'scene_writer',
      title: '正文场景',
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '旁白：旧文本。',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'run-1',
      currentStage: 'scene_writing',
      completedStages: ['requirements', 'worldbuilding', 'characters', 'story_background', 'outline', 'outline_review'],
      awaitingApprovalArtifactId: 'scene-review',
      updatedAt: now,
    })

    await recordApproval(project.id, {
      artifactId: 'scene-review',
      action: 'manual_edit',
      markdown: '旁白：新文本。',
    })

    const artifact = (await listArtifacts(project.id))[0]
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    expect(artifact.status).toBe('needs_review')
    expect(artifact.markdown).toContain('新文本')
    expect(checkpoint?.completedStages).not.toContain('scene_writing')
    expect(checkpoint?.awaitingApprovalArtifactId).toBe('scene-review')
    expect(refreshedProject.status).toBe('awaiting_review')
    expect(refreshedProject.currentStage).toBe('scene_writing')
  })

  it('lets YOLO accept the pending review artifact and continue the workflow', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-yolo-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 2,
    })
    const project = await createProject({
      title: 'YOLO 接续测试',
      brief: '测试 YOLO 从待确认阶段继续。',
      mode: 'step',
    })
    const now = new Date().toISOString()
    await writeArtifact({
      id: 'requirements-review',
      projectId: project.id,
      stage: 'requirements',
      agentId: 'requirements_planner',
      title: '需求确认',
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
      json: {},
      markdown: '旁白：需求待确认。',
      references: [],
    })
    await writeCheckpoint({
      projectId: project.id,
      runId: 'run-1',
      currentStage: 'requirements',
      completedStages: [],
      awaitingApprovalArtifactId: 'requirements-review',
      updatedAt: now,
    })

    await startWorkflow(project.id, 'yolo')
    while (isProjectRunning(project.id)) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    const artifacts = await listArtifacts(project.id)
    const checkpoint = await readCheckpoint(project.id)
    const refreshedProject = await readProject(project.id)
    expect(artifacts.find(artifact => artifact.id === 'requirements-review')?.status).toBe('approved')
    expect(checkpoint?.completedStages).toEqual(workflowOrder)
    expect(refreshedProject.status).toBe('completed')
  })

  it('loops outline review back through character design when missing characters are found', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-outline-character-loop-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekApiKey: 'test-key',
      deepSeekBaseUrl: 'https://deepseek.test',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 3,
    })
    const project = await createProject({
      title: '配角回路测试',
      brief: '测试大纲发现缺少配角时补充角色设定。',
      mode: 'yolo',
    })
    let outlineReviewCalls = 0
    const stageCalls: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ role: string, content: string }> }
      const userMessage = body.messages?.find(message => message.role === 'user')
      const input = JSON.parse(userMessage?.content || '{}') as { stage?: string }
      const stage = input.stage || 'unknown'
      stageCalls.push(stage)
      const reviewData = stage === 'outline_review'
        ? (++outlineReviewCalls === 1
            ? {
                passed: false,
                findings: [{
                  severity: 'blocker',
                  message: '大纲需要新增配角证人，但角色设定中没有这个人物。',
                  suggestion: '回到角色设定补充证人角色，再重写相关大纲段落。',
                }],
              }
            : { passed: true, findings: [] })
        : { passed: true, findings: [] }
      const content = {
        markdown: stage.endsWith('_review') ? `# ${stage}\n\n评审` : `# ${stage}\n\n旁白：${stage}`,
        data: stage.endsWith('_review') ? reviewData : { stage },
      }
      const assistantContent = JSON.stringify(content)
      if ((body as { stream?: boolean }).stream) {
        return new Response([
          `data: ${JSON.stringify({ choices: [{ delta: { content: assistantContent } }] })}`,
          '',
          'data: [DONE]',
          '',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: assistantContent } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await startWorkflow(project.id, 'yolo')
    while (isProjectRunning(project.id)) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    const firstOutlineReview = stageCalls.indexOf('outline_review')
    const secondOutlineReview = stageCalls.indexOf('outline_review', firstOutlineReview + 1)
    expect(firstOutlineReview).toBeGreaterThan(-1)
    expect(secondOutlineReview).toBeGreaterThan(firstOutlineReview)
    expect(stageCalls.slice(firstOutlineReview + 1, secondOutlineReview)).toEqual([
      'characters',
      'characters_review',
      'story_background',
      'story_background_review',
      'outline',
    ])
    expect((await readProject(project.id)).status).toBe('completed')
  })
})

describe('agent references and planner messages', () => {
  it('merges Tavily references returned by model tool calls', () => {
    const duplicate = {
      title: 'Transit Research',
      url: 'https://example.com/transit',
      query: 'q',
      source: 'tavily' as const,
    }
    const references = extractToolReferences([
      { output: { references: [duplicate, duplicate, { source: 'other', url: 'https://example.com/nope' }] } },
      { output: { references: [{ ...duplicate, title: 'Same URL' }] } },
    ])
    expect(references).toEqual([duplicate])
    expect(dedupeReferences([duplicate, { ...duplicate, title: 'Different title' }])).toEqual([duplicate])
  })

  it('returns and records a fallback planner reply when DeepSeek is not configured', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-planner-'))
    process.env.NOVEL_WRITER_HOME = tempHome
    await writeConfig({
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const project = await createProject({
      title: '需求对话',
      brief: '多回合确认需求',
      mode: 'step',
    })
    const result = await appendUserMessage(project.id, '我希望故事更偏悬疑。')
    expect(result.reply).toContain('需求确认专家')
  })

  it('loads package-local skills even when cwd is outside the package', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-cwd-'))
    const previousCwd = process.cwd()
    process.chdir(tempHome)
    try {
      const skills = await loadAgentSkills(getAgentForStage('worldbuilding'))
      expect(skills).toContain('visual novel')
      expect(skills).toContain('Worldbuilding')
    }
    finally {
      process.chdir(previousCwd)
    }
  })
})

describe('visual novel manuscript formatting', () => {
  it('keeps speaker labels clean and converts narration to narrator lines', () => {
    const markdown = [
      '# 第一章',
      '',
      '璃央（压低声音）：别动。',
      '她看向门缝外的冷光。',
      '澪[皱眉]：你听见了吗？',
      '旁白：雨声在走廊尽头停了一瞬。',
    ].join('\n')

    expect(normalizeVisualNovelMarkdown('scene_writing', markdown)).toBe([
      '# 第一章',
      '',
      '璃央：（压低声音）别动。',
      '旁白：她看向门缝外的冷光。',
      '澪：[皱眉]你听见了吗？',
      '旁白：雨声在走廊尽头停了一瞬。',
    ].join('\n'))
  })

  it('does not rewrite planning artifacts', () => {
    const markdown = '璃央（压低声音）：别动。'
    expect(normalizeVisualNovelMarkdown('outline', markdown)).toBe(markdown)
  })
})

describe('workspace stage timeline', () => {
  it('shows the outline and outline review as independent clickable stages', () => {
    const now = new Date().toISOString()
    const artifacts = [
      {
        id: 'outline-1',
        projectId: 'p1',
        stage: 'outline',
        agentId: 'outline_writer',
        title: '小说大纲',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        json: {},
        markdown: '大纲',
        references: [],
      },
      {
        id: 'outline-review-1',
        projectId: 'p1',
        stage: 'outline_review',
        agentId: 'entertainment_reviewer',
        title: '大纲评审',
        status: 'needs_review',
        createdAt: now,
        updatedAt: now,
        json: { findings: [] },
        markdown: '评审',
        references: [],
      },
    ] as ArtifactRef[]

    const timeline = buildStageTimeline(undefined, artifacts)
    expect(timeline.find(item => item.stage === 'outline')?.artifact?.id).toBe('outline-1')
    expect(timeline.find(item => item.stage === 'outline')?.state).toBe('draft')
    expect(timeline.find(item => item.stage === 'outline_review')?.artifact?.id).toBe('outline-review-1')
    expect(timeline.find(item => item.stage === 'outline_review')?.state).toBe('needs_review')
    expect(timeline.find(item => item.stage === 'outline_review')?.loopTargetStage).toBe('outline')
    expect(timeline.find(item => item.stage === 'outline_review')?.loopTargetLabel).toBe('大纲')
    expect(timeline.find(item => item.stage === 'outline_review')?.revisionLoop).toBeUndefined()
    expect(timeline.find(item => item.stage === 'outline')?.dependencyLoopTargetStage).toBe('characters')
    expect(timeline.find(item => item.stage === 'outline')?.dependencyLoopTargetLabel).toBe('角色设定')
    expect(timeline.find(item => item.stage === 'outline')?.dependencyLoopSpan).toBe(4)
  })

  it('shows review revision loop counts when a review artifact records them', () => {
    const now = new Date().toISOString()
    const timeline = buildStageTimeline({
      id: 'p1',
      title: '循环测试',
      brief: '测试流程回路显示',
      mode: 'yolo',
      status: 'running',
      currentStage: 'worldbuilding_review',
      createdAt: now,
      updatedAt: now,
      maxRevisionLoops: 12,
    }, [{
      id: 'worldbuilding-review-2',
      projectId: 'p1',
      stage: 'worldbuilding_review',
      agentId: 'worldbuilding_reviewer',
      title: '世界观评审',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      json: { passed: false, findings: [], revisionLoop: 2 },
      markdown: '评审',
      references: [],
    }])

    const item = timeline.find(entry => entry.stage === 'worldbuilding_review')
    expect(item?.state).toBe('running')
    expect(item?.loopTargetStage).toBe('worldbuilding')
    expect(item?.revisionLoop).toBe(2)
    expect(item?.maxRevisionLoops).toBe(12)
  })
})
