import { access, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { ArtifactRef } from '../src/lib/types'
import { appendJsonl, readJsonl } from '../src/lib/server/jsonl'
import { createMacSandboxProfile } from '../src/lib/server/sandbox'
import { normalizeTavilyReferences } from '../src/lib/server/tavily'
import { normalizeVisualNovelMarkdown } from '../src/lib/server/visual-novel-format'
import { applyProjectInputUpdate } from '../src/lib/server/project-input'
import { compactArtifacts, formatPinnedProjectCanon } from '../src/lib/server/context'
import { getAgentForStage, loadAgentSkills, workflowOrder } from '../src/lib/server/agents'
import {
  createProject,
  deleteTrashedProject,
  emptyTrash,
  listArtifacts,
  listTrashedProjects,
  readCheckpoint,
  readConfig,
  readProject,
  restoreTrashedProject,
  trashProject,
  writeArtifact,
  writeCheckpoint,
  writeConfig,
} from '../src/lib/server/store'
import { getProjectRoot, getTrashedProjectRoot } from '../src/lib/server/paths'
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
        characters: '璃央：失忆的机械师。',
        outline: '第一幕发现水晶枯竭。',
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
        characters: '澪：桥梁管理员。',
        outline: '桥断之后开始调查。',
        allowExpertChanges: true,
      },
    })
    expect(project.maxRevisionLoops).toBe(50)
    expect(project.seed?.worldbuilding).toBe('雨城由七座桥连接。')
    expect(project.seed?.allowExpertChanges).toBe(true)
    await expect(readProject(project.id)).resolves.toMatchObject({
      seed: {
        characters: '澪：桥梁管理员。',
        outline: '桥断之后开始调查。',
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
        characters: '旧角色',
        outline: '旧大纲',
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
        characters: '旧角色',
        outline: '旧大纲',
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
        allowExpertChanges: false,
      },
    })

    expect(result.revision.changedFields.map(change => change.field)).toEqual(['title', 'seed.characters'])
    expect(result.revision.changedFields.find(change => change.field === 'title')?.affectsContent).toBe(false)
    expect(result.revision.affectedStages[0]).toBe('characters')
    expect(result.revision.affectedStages).toContain('final')
    expect(result.revision.feedback).toContain('Only change the parts required')
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
  })
})
